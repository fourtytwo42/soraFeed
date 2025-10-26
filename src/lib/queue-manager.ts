import { queueDb } from './sqlite';
import { getClient, releaseClient } from './db'; // PostgreSQL connection for database data
import { TimelineVideo, VideoHistory } from '@/types/timeline';
import { SoraFeedItem } from '@/types/sora';
import { PlaylistManager } from './playlist-manager';
import { v4 as uuidv4 } from 'uuid';

// Cache for database counts (2 hour TTL)
const dbCountCache = new Map<string, { count: number; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds - longer cache to reduce DB load

// Queue for pending count queries to prevent overwhelming the database
const countQueryQueue: Array<{
  searchTerm: string;
  format: string;
  cacheKey: string;
  resolve: (count: number) => void;
  reject: (error: Error) => void;
}> = [];
let activeCountQueries = 0;
const MAX_CONCURRENT_COUNT_QUERIES = 1; // Process one at a time to avoid overwhelming DB

// Helper function to get cached database count
async function getCachedDbCount(searchTerm: string, format: string): Promise<number> {
  const cacheKey = `${searchTerm}:${format}`;
  const cached = dbCountCache.get(cacheKey);
  
  // Return cached value if still valid
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log(`💾 Using cached count for "${searchTerm}": ${cached.count} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
    return cached.count;
  }

  if (cached) {
    console.log(`⏰ Cache expired for "${searchTerm}" (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s), fetching fresh data`);
  } else {
    console.log(`🆕 No cache found for "${searchTerm}", fetching from database`);
  }

  // Add debugging for all search terms
  console.log(`🔍 Processing search term: "${searchTerm}" (length: ${searchTerm.length})`);

  // Only skip extremely short terms (1-2 characters)
  if (searchTerm.length < 2) {
    console.log(`⚠️ Skipping very short search term "${searchTerm}", using default count of 50`);
    return 50;
  }

  // Only skip the most common single words that would be extremely expensive
  const veryCommonWords = ['the', 'and', 'a', 'an'];
  if (veryCommonWords.includes(searchTerm.toLowerCase()) && searchTerm.split(/\s+/).length === 1) {
    console.log(`⚠️ Skipping very common word "${searchTerm}", using default count of 100`);
    return 100;
  }

  // Only skip extremely complex queries (more than 10 words or very long)
  const wordCount = searchTerm.trim().split(/\s+/).length;
  if (wordCount > 10 || searchTerm.length > 200) {
    console.log(`⚠️ Skipping extremely complex search term "${searchTerm}" (${wordCount} words), using default count of 200`);
    return 200;
  }

  // Return cached value if available
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.count;
  }
  
  // SKIP database queries - just use cached or sensible defaults
  // Database queries are too slow and causing 10s timeouts
  console.log(`⚡ Using cached/default count for "${searchTerm}"`);
  
  // Return cached value if available
  if (cached) {
    console.log(`💾 Using cached count: ${cached.count}`);
    return cached.count;
  }
  
  // Return sensible defaults based on term characteristics
  let estimatedCount = 500;
  
  if (wordCount === 1) {
    // Single word searches likely have many results
    estimatedCount = 1000;
  } else if (wordCount === 2) {
    // Two word phrases - moderate results
    estimatedCount = 500;
  } else if (wordCount >= 3) {
    // Long, specific phrases - fewer results
    estimatedCount = 200;
  }
  
  console.log(`📊 Estimated count for "${searchTerm}" (${wordCount} words): ${estimatedCount}`);
  
  // Cache the estimate
  dbCountCache.set(cacheKey, { count: estimatedCount, timestamp: Date.now() });
  
  return estimatedCount;
  
  // Use a queue to prevent overwhelming the database
  // return new Promise<number>((resolve, reject) => {
  //   // Add to queue
  //   countQueryQueue.push({
  //     searchTerm,
  //     format,
  //     cacheKey,
  //     resolve,
  //     reject
  //   });
  //   
  //   // Process queue
  //   processCountQueryQueue();
  // });
}

// Process queued count queries one at a time
async function processCountQueryQueue() {
  // Skip if already processing or queue is empty
  if (activeCountQueries >= MAX_CONCURRENT_COUNT_QUERIES || countQueryQueue.length === 0) {
    return;
  }
  
  // Get next query from queue
  const queryTask = countQueryQueue.shift();
  if (!queryTask) return;
  
  activeCountQueries++;
  
  try {
    await executeCountQuery(queryTask.searchTerm, queryTask.format, queryTask.cacheKey)
      .then(queryTask.resolve)
      .catch(queryTask.reject);
  } finally {
    activeCountQueries--;
    // Process next query in queue
    setTimeout(() => processCountQueryQueue(), 500); // Small delay between queries
  }
}

// Execute a single count query
async function executeCountQuery(searchTerm: string, format: string, cacheKey: string): Promise<number> {
  let client: any = null;
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 25000); // 25 second timeout
    });
    
    const clientPromise = getClient();
    client = await Promise.race([clientPromise, timeoutPromise]);
    
    // Parse search query to separate include and exclude terms
    const parseSearchQuery = (searchQuery: string) => {
      const words = searchQuery.trim().split(/\s+/);
      const includeTerms: string[] = [];
      const excludeTerms: string[] = [];
      
      for (const word of words) {
        if (word.startsWith('-') && word.length > 1) {
          excludeTerms.push(word.substring(1));
        } else if (word.length > 0) {
          includeTerms.push(word);
        }
      }
      
      return { includeTerms, excludeTerms };
    };

    const { includeTerms, excludeTerms } = parseSearchQuery(searchTerm);
    const includeQuery = includeTerms.join(' ');
    
    if (includeTerms.length === 0) {
      return 0;
    }

    // Build format filtering conditions
    let formatClause = '';
    if (format === 'wide') {
      formatClause = ' AND p.width > p.height';
    } else if (format === 'tall') {
      formatClause = ' AND p.height > p.width';
    }

    // Build exclude conditions - optimized with ILIKE
    let excludeConditions = '';
    if (excludeTerms.length > 0) {
      excludeConditions = excludeTerms.map((term, index) => 
        `AND p.text NOT ILIKE '%${term}%'`
      ).join(' ');
    }

    // Optimized count query - ILIKE only (fast)
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM sora_posts p
      WHERE p.text ILIKE '%' || $1 || '%'
      ${formatClause}
      ${excludeConditions}
    `;

    // Add debugging
    console.log(`🔍 Debug query for "${searchTerm}":`, {
      includeQuery,
      format,
      formatClause,
      excludeConditions,
      fullQuery: countQuery
    });

    // Test query without format filtering to see if that's the issue
    const testQuery = `
      SELECT COUNT(*) as total_count
      FROM sora_posts p
      WHERE p.text ILIKE '%' || $1 || '%'
    `;
    const testResult = await client.query(testQuery, [includeQuery]);
    const testCount = parseInt(testResult.rows[0].total_count);
    console.log(`🧪 Test query (no format filter) for "${searchTerm}": ${testCount} videos found`);

    // Add timeout to query execution
    const queryPromise = client.query(countQuery, [includeQuery]);
    const queryTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query execution timeout')), 20000); // 20 second timeout
    });
    
    const countResult = await Promise.race([queryPromise, queryTimeoutPromise]);
    const totalCount = parseInt(countResult.rows[0].total_count);
    
    console.log(`📊 Query result for "${searchTerm}": ${totalCount} videos found (with format: ${format})`);
    console.log(`🧪 Test query (no format filter) for "${searchTerm}": ${testCount} videos found`);
    
    // Cache the result
    dbCountCache.set(cacheKey, { count: totalCount, timestamp: Date.now() });
    
    return totalCount;
  } catch (error) {
    console.error(`Error fetching cached count for ${searchTerm}:`, error);
    
    // If we have a cached value (even if expired), return it as fallback
    const cached = dbCountCache.get(cacheKey);
    if (cached) {
      console.log(`🔄 Using expired cache for ${searchTerm}: ${cached.count}`);
      return cached.count;
    }
    
    // Return a reasonable default if no cache available
    console.log(`⚠️ No cache available for ${searchTerm}, using default count of 100`);
    return 100;
  } finally {
    // Release the client
    if (client && typeof client.release === 'function') {
      releaseClient(client);
    }
  }
}

// Track displays currently starting a new loop to prevent race conditions
const loopStartInProgress = new Set<string>();

export class QueueManager {
  // Search for videos in PostgreSQL database
  static async searchVideos(
    searchTerm: string, 
    count: number, 
    mode: 'newest' | 'random',
    format: 'mixed' | 'wide' | 'tall' = 'mixed',
    excludeVideoIds: string[] = []
  ): Promise<SoraFeedItem[]> {
    const client = await getClient();
    
    try {
      let query: string;
      let params: any[];

    // Build format filtering conditions
    let formatClause = '';
    if (format === 'wide') {
      formatClause = ' AND p.width > p.height';
    } else if (format === 'tall') {
      formatClause = ' AND p.height > p.width';
    }
    // 'mixed' means no additional filtering

    // Use PostgreSQL parameter placeholders ($1, $2, etc.)
    const excludeClause = excludeVideoIds.length > 0 
      ? `AND p.id NOT IN (${excludeVideoIds.map((_, i) => `$${i + 2}`).join(', ')})`
      : '';

    if (mode === 'newest') {
      query = `
        SELECT 
          p.id, p.text, p.posted_at, p.permalink,
          p.video_url, p.video_url_md, p.thumbnail_url, p.gif_url,
          p.width, p.height, p.generation_id, p.task_id,
          c.id as creator_id, c.username, c.display_name,
          c.profile_picture_url, c.permalink as creator_permalink,
          c.follower_count, c.following_count, c.post_count, c.verified
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.text ILIKE $1 ${formatClause} ${excludeClause}
        ORDER BY p.posted_at DESC
        LIMIT $${excludeVideoIds.length + 2}
      `;
      params = [`%${searchTerm}%`, ...excludeVideoIds, count];
    } else {
      // For random mode, use a completely different approach - multiple random queries
      // This ensures we get different results each time by randomizing the database query itself
      const crypto = require('crypto');
      
      // Get total count first to know our range
      const countQuery = `
        SELECT COUNT(*) as total_count
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.text ILIKE $1 ${formatClause} ${excludeClause}
      `;
      const countResult = await client.query(countQuery, [`%${searchTerm}%`, ...excludeVideoIds]);
      const totalAvailable = parseInt(countResult.rows[0].total_count);
      
      console.log(`🎲 Random mode: Found ${totalAvailable} total videos for "${searchTerm}"`);
      
      if (totalAvailable === 0) {
        return [];
      }
      
      // Generate multiple random offsets and fetch videos from different positions
      const selectedVideos: any[] = [];
      const attempts = Math.min(count * 3, 30); // Try up to 3x what we need, max 30 attempts
      
      for (let i = 0; i < attempts && selectedVideos.length < count; i++) {
        // Generate cryptographically secure random offset
        const randomBytes = crypto.randomBytes(4);
        const randomOffset = randomBytes.readUInt32BE(0) % totalAvailable;
        
        const randomQuery = `
          SELECT 
            p.id, p.text, p.posted_at, p.permalink,
            p.video_url, p.video_url_md, p.thumbnail_url, p.gif_url,
            p.width, p.height, p.generation_id, p.task_id,
            c.id as creator_id, c.username, c.display_name,
            c.profile_picture_url, c.permalink as creator_permalink,
            c.follower_count, c.following_count, c.post_count, c.verified
          FROM sora_posts p
          JOIN creators c ON p.creator_id = c.id
          WHERE p.text ILIKE $1 ${formatClause} ${excludeClause}
          ORDER BY p.posted_at DESC
          LIMIT 1 OFFSET $${excludeVideoIds.length + 2}
        `;
        
        const randomResult = await client.query(randomQuery, [`%${searchTerm}%`, ...excludeVideoIds, randomOffset]);
        
        if (randomResult.rows.length > 0) {
          const video = randomResult.rows[0];
          // Check if we already have this video (avoid duplicates)
          if (!selectedVideos.some(v => v.id === video.id)) {
            selectedVideos.push(video);
          }
        }
      }
      
      console.log(`🎲 Random mode: Selected ${selectedVideos.length} unique videos from ${attempts} random queries`);
      console.log(`🎲 Selected video IDs: ${selectedVideos.map((v: any) => v.id.slice(-6)).join(', ')}`);
      
      // Transform to SoraFeedItem format and return
      return selectedVideos.map((row: any) => ({
        post: {
          id: row.id,
          text: row.text,
          posted_at: new Date(row.posted_at).getTime(),
          updated_at: new Date(row.posted_at).getTime(),
          posted_to_public: true,
          preview_image_url: row.thumbnail_url,
          permalink: row.permalink,
          attachments: [{
            id: row.generation_id,
            kind: "sora" as const,
            generation_id: row.generation_id,
            generation_type: "video_gen" as const,
            task_id: row.task_id,
            width: row.width,
            height: row.height,
            output_blocked: false,
            encodings: {
              source: { path: row.video_url },
              md: { path: row.video_url_md },
              thumbnail: { path: row.thumbnail_url },
              gif: { path: row.gif_url }
            }
          }]
        },
        profile: {
          user_id: row.creator_id,
          username: row.username,
          display_name: row.display_name,
          profile_picture_url: row.profile_picture_url,
          is_default_profile_picture: false,
          permalink: row.creator_permalink,
          follower_count: row.follower_count,
          following_count: row.following_count,
          post_count: row.post_count,
          verified: row.verified
        }
      }));
    }

    console.log(`🔍 SQL Query Debug:`, {
      searchTerm,
      requestedCount: count,
      excludeCount: excludeVideoIds.length,
      finalQuery: query.replace(/\s+/g, ' ').trim(),
      params: params.map((p, i) => `$${i+1}=${p}`).join(', ')
    });

    const result = await client.query(query, params);
    
    console.log(`📊 SQL Result: Found ${result.rows.length} rows (requested ${count})`);
    
    // For newest mode, just use the results as-is
    let selectedRows = result.rows;
    
      // Transform to SoraFeedItem format
      return selectedRows.map((row: any) => ({
        post: {
          id: row.id,
          text: row.text,
          posted_at: row.posted_at,
          permalink: row.permalink,
          attachments: [{
            generation_id: row.generation_id,
            task_id: row.task_id,
            width: row.width,
            height: row.height,
            encodings: {
              source: { path: row.video_url },
              md: { path: row.video_url_md },
              thumbnail: { path: row.thumbnail_url },
              gif: { path: row.gif_url }
            }
          }]
        },
        profile: {
          user_id: row.creator_id,
          username: row.username,
          display_name: row.display_name,
          profile_picture_url: row.profile_picture_url,
          permalink: row.creator_permalink,
          follower_count: row.follower_count,
          following_count: row.following_count,
          post_count: row.post_count,
          verified: row.verified
        }
      }));
    } finally {
      client.release();
    }
  }

  // Get videos already played for a block in the current loop only
  static getPlayedVideosForBlock(blockId: string, loopIteration: number): string[] {
    const stmt = queueDb.prepare(`
      SELECT DISTINCT video_id FROM video_history 
      WHERE block_id = ? AND loop_iteration = ?
    `);
    const rows = stmt.all(blockId, loopIteration) as any[];
    return rows.map(row => row.video_id);
  }

  // Get videos already used in the entire playlist (across all blocks and loops)
  static getPlayedVideosForPlaylist(playlistId: string): string[] {
    const stmt = queueDb.prepare(`
      SELECT DISTINCT vh.video_id 
      FROM video_history vh
      JOIN playlist_blocks pb ON vh.block_id = pb.id
      WHERE pb.playlist_id = ?
    `);
    const rows = stmt.all(playlistId) as any[];
    return rows.map(row => row.video_id);
  }

  // Get videos already queued in the current timeline (to prevent duplicates within the same loop)
  static getQueuedVideosForPlaylist(playlistId: string): string[] {
    const stmt = queueDb.prepare(`
      SELECT DISTINCT video_id FROM timeline_videos 
      WHERE playlist_id = ?
    `);
    const rows = stmt.all(playlistId) as any[];
    return rows.map(row => row.video_id);
  }

  // Reset exclusions for a specific search term by clearing video history
  static resetExclusionsForSearchTerm(searchTerm: string, playlistId: string): void {
    console.log(`🔄 Resetting exclusions for search term: "${searchTerm}"`);
    
    // Get all blocks with this search term
    const blocksStmt = queueDb.prepare(`
      SELECT id FROM playlist_blocks 
      WHERE playlist_id = ? AND search_term = ?
    `);
    const blocks = blocksStmt.all(playlistId, searchTerm) as any[];
    
    if (blocks.length === 0) {
      console.log(`⚠️ No blocks found for search term "${searchTerm}"`);
      return;
    }
    
    // Clear video history for all blocks with this search term
    const blockIds = blocks.map(block => block.id);
    const placeholders = blockIds.map(() => '?').join(',');
    
    const deleteStmt = queueDb.prepare(`
      DELETE FROM video_history 
      WHERE block_id IN (${placeholders})
    `);
    
    const result = deleteStmt.run(...blockIds);
    console.log(`🗑️ Cleared ${result.changes} video history entries for search term "${searchTerm}"`);
    
    // Also clear any queued videos for these blocks
    const clearQueuedStmt = queueDb.prepare(`
      DELETE FROM timeline_videos 
      WHERE block_id IN (${placeholders})
    `);
    
    const queuedResult = clearQueuedStmt.run(...blockIds);
    console.log(`🗑️ Cleared ${queuedResult.changes} queued videos for search term "${searchTerm}"`);
  }

  // Get upcoming videos in the queue for a display
  static getUpcomingVideos(displayId: string, limit: number = 10): TimelineVideo[] {
    const stmt = queueDb.prepare(`
      SELECT * FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued'
      ORDER BY timeline_position ASC 
      LIMIT ?
    `);
    
    const rows = stmt.all(displayId, limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      display_id: row.display_id,
      playlist_id: row.playlist_id,
      block_id: row.block_id,
      video_id: row.video_id,
      block_position: row.block_position,
      timeline_position: row.timeline_position,
      loop_iteration: row.loop_iteration,
      status: row.status,
      played_at: row.played_at,
      video_data: row.video_data,
      created_at: row.created_at
    }));
  }

  // Populate timeline videos for a playlist
  static async populateTimelineVideos(
    displayId: string,
    playlistId: string, 
    loopIteration: number = 0
  ): Promise<void> {
    console.log(`🎵 Populating timeline videos for playlist ${playlistId}, loop ${loopIteration}`);
    
    // CRITICAL: Clear existing timeline videos to prevent duplicates
    const deleteResult = queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(displayId);
    console.log(`🗑️ Cleared ${deleteResult.changes} existing timeline videos for display ${displayId}`);
    
    const blocks = PlaylistManager.getPlaylistBlocks(playlistId);
    let timelinePosition = 0;

    // Get all videos that should be excluded from this entire playlist
    const playedVideosForPlaylist = this.getPlayedVideosForPlaylist(playlistId);
    const queuedVideosForPlaylist = this.getQueuedVideosForPlaylist(playlistId);
    const allExcludedVideos = [...new Set([...playedVideosForPlaylist, ...queuedVideosForPlaylist])];
    
    console.log(`🚫 Global exclusions: ${playedVideosForPlaylist.length} played + ${queuedVideosForPlaylist.length} queued = ${allExcludedVideos.length} total excluded videos`);

    // Process each block sequentially (can't use async inside SQLite transaction)
    for (const block of blocks) {
      console.log(`📦 Processing block: "${block.search_term}" (${block.video_count} videos)`);
      
      // Get videos already played for this block in the current loop (for additional logging)
      const playedVideosForBlock = this.getPlayedVideosForBlock(block.id, loopIteration);
      console.log(`🚫 Block-specific exclusions: ${playedVideosForBlock.length} already played videos from current loop ${loopIteration}`);

      // First, try to search with global exclusions
      console.log(`🔍 Searching for videos: term="${block.search_term}", count=${block.video_count}, mode=${block.fetch_mode}, format=${block.format}, excluding=${allExcludedVideos.length} videos globally`);
      let videos = await this.searchVideos(
        block.search_term,
        block.video_count,
        block.fetch_mode,
        block.format,
        allExcludedVideos
      );

      // If we didn't find enough videos, check if we should reset exclusions for this search term
      if (videos.length < block.video_count) {
        console.log(`⚠️ Only found ${videos.length} videos (requested ${block.video_count}) for "${block.search_term}"`);
        
        // Check if we've exhausted content for this search term
        const totalAvailableVideos = await this.searchVideos(
          block.search_term,
          1000, // Get a large number to see total available
          block.fetch_mode,
          block.format,
          [] // No exclusions to see total available
        );
        
        console.log(`📊 Total available videos for "${block.search_term}": ${totalAvailableVideos.length}`);
        
        // Check if we've exhausted videos for this specific search term
        // We should reset if we can't find enough videos for this block
        if (videos.length === 0) {
          console.log(`🔄 No videos found for "${block.search_term}" - resetting exclusions and starting fresh`);
          
          // Reset exclusions for this specific search term by clearing video history
          this.resetExclusionsForSearchTerm(block.search_term, playlistId);
          
          // Search again without exclusions
          videos = await this.searchVideos(
            block.search_term,
            block.video_count,
            block.fetch_mode,
            block.format,
            [] // No exclusions after reset
          );
          
          console.log(`✅ After reset: found ${videos.length} videos for "${block.search_term}"`);
        } else {
          console.log(`⚠️ Only found ${videos.length} videos (requested ${block.video_count}) for "${block.search_term}"`);
          console.log(`   This suggests the search term might be too specific or there's a database issue`);
        }
      }

      console.log(`✅ Found ${videos.length} new videos for "${block.search_term}" (requested ${block.video_count})`);

      // Validate format filtering - ensure all videos match the requested format
      const formatFilteredVideos = videos.filter(video => {
        const attachment = video.post.attachments[0];
        if (!attachment || !attachment.width || !attachment.height) {
          console.log(`⚠️ Video ${video.post.id} missing dimensions, excluding`);
          return false;
        }
        
        const isWide = attachment.width > attachment.height;
        const isTall = attachment.height > attachment.width;
        
        if (block.format === 'wide' && !isWide) {
          console.log(`⚠️ Video ${video.post.id} is ${attachment.width}x${attachment.height} (tall) but block requires wide, excluding`);
          return false;
        }
        if (block.format === 'tall' && !isTall) {
          console.log(`⚠️ Video ${video.post.id} is ${attachment.width}x${attachment.height} (wide) but block requires tall, excluding`);
          return false;
        }
        
        return true;
      });

      console.log(`🎯 After format validation: ${formatFilteredVideos.length} videos match format "${block.format}" (requested ${block.video_count})`);

      // Add videos to timeline using transaction
      const transaction = queueDb.transaction(() => {
        const stmt = queueDb.prepare(`
          INSERT INTO timeline_videos (
            id, display_id, playlist_id, block_id, video_id,
            block_position, timeline_position, loop_iteration,
            status, video_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
        `);

        // Only add videos that match the format filter
        const videosToAdd = formatFilteredVideos.slice(0, block.video_count);
        console.log(`📝 Adding ${videosToAdd.length} videos to timeline (format-filtered from ${videos.length} found)`);
        
        // Add the new videos to the global exclusion list to prevent duplicates in subsequent blocks
        // Only do this if we didn't reset exclusions (to avoid re-adding videos we just reset)
        if (videos.length >= block.video_count || videos.length === formatFilteredVideos.length) {
          videosToAdd.forEach(video => {
            allExcludedVideos.push(video.post.id);
          });
        }
        
        // Warn if we couldn't find enough videos of the requested format
        if (videosToAdd.length < block.video_count) {
          console.log(`⚠️ WARNING: Only found ${videosToAdd.length} ${block.format} videos for "${block.search_term}" (requested ${block.video_count})`);
          console.log(`   This may cause the playlist to have fewer videos than expected.`);
        }
        
        videosToAdd.forEach((video, index) => {
          const videoId = uuidv4();
          
          // Store only essential video data to reduce memory usage
          const essentialVideoData = {
            post: {
              id: video.post.id,
              text: video.post.text,
              permalink: video.post.permalink,
              attachments: video.post.attachments ? [{
                generation_id: video.post.attachments[0]?.generation_id,
                task_id: video.post.attachments[0]?.task_id,
                width: video.post.attachments[0]?.width,
                height: video.post.attachments[0]?.height,
                encodings: {
                  source: { path: video.post.attachments[0]?.encodings?.source?.path },
                  md: { path: video.post.attachments[0]?.encodings?.md?.path },
                  thumbnail: { path: video.post.attachments[0]?.encodings?.thumbnail?.path }
                }
              }] : []
            },
            profile: {
              user_id: video.profile.user_id,
              username: video.profile.username,
              display_name: video.profile.display_name,
              profile_picture_url: video.profile.profile_picture_url
            }
          };
          
          stmt.run(
            videoId,
            displayId,
            playlistId,
            block.id,
            video.post.id,
            index,
            timelinePosition,
            loopIteration,
            JSON.stringify(essentialVideoData) // Store only essential data
          );
          timelinePosition++;
        });
      });

      transaction();
    }

    console.log(`✅ Timeline populated with ${timelinePosition} videos`);
  }

  // Get next video in timeline for display
  static getNextTimelineVideo(displayId: string): TimelineVideo | null {
    // Get the display's current timeline position
    const displayStmt = queueDb.prepare('SELECT timeline_position FROM displays WHERE id = ?');
    const display = displayStmt.get(displayId) as any;
    
    if (!display) return null;
    
    const currentPosition = display.timeline_position || 0;
    
    // Get the next queued video at or after the current position
    const stmt = queueDb.prepare(`
      SELECT * FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued' AND timeline_position >= ?
      ORDER BY timeline_position ASC
      LIMIT 1
    `);
    
    const row = stmt.get(displayId, currentPosition) as any;
    if (!row) return null;

    return {
      id: row.id,
      display_id: row.display_id,
      playlist_id: row.playlist_id,
      block_id: row.block_id,
      video_id: row.video_id,
      block_position: row.block_position,
      timeline_position: row.timeline_position,
      loop_iteration: row.loop_iteration,
      status: row.status,
      played_at: row.played_at,
      video_data: row.video_data,
      created_at: row.created_at
    };
  }

  // Mark video as played and add to history
  static markVideoPlayed(timelineVideoId: string): void {
    const transaction = queueDb.transaction(() => {
      // Get the timeline video
      const getStmt = queueDb.prepare('SELECT * FROM timeline_videos WHERE id = ?');
      const video = getStmt.get(timelineVideoId) as any;
      
      if (!video) {
        console.error(`❌ Timeline video not found: ${timelineVideoId}`);
        return;
      }

      console.log(`🎯 Found video to mark as played: ${video.video_id.slice(-6)} (timeline: ${timelineVideoId.slice(-6)}, status: ${video.status})`);

      // Don't mark as played if it's already played (prevents duplicate position increments)
      if (video.status === 'played') {
        console.log(`⚠️ Video already marked as played, skipping`);
        return;
      }

      // Mark as played
      const updateStmt = queueDb.prepare(`
        UPDATE timeline_videos 
        SET status = 'played', played_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      const result = updateStmt.run(timelineVideoId);
      console.log(`✏️ Updated ${result.changes} rows to 'played' status`);

      // Add to history
      const historyStmt = queueDb.prepare(`
        INSERT INTO video_history (id, display_id, video_id, block_id, loop_iteration)
        VALUES (?, ?, ?, ?, ?)
      `);
      historyStmt.run(
        uuidv4(),
        video.display_id,
        video.video_id,
        video.block_id,
        video.loop_iteration
      );

      // Update block play statistics
      PlaylistManager.updateBlockPlayStats(video.block_id);

      // Update display's timeline position to the next video position
      const updateDisplayStmt = queueDb.prepare(`
        UPDATE displays 
        SET timeline_position = ? 
        WHERE id = ?
      `);
      updateDisplayStmt.run(video.timeline_position + 1, video.display_id);
    });

    transaction();
  }

  // Check if we need to start a new loop
  static async checkAndStartNewLoop(displayId: string): Promise<boolean> {
    // Prevent race condition: check if loop start is already in progress for this display
    if (loopStartInProgress.has(displayId)) {
      console.log(`⏳ Loop start already in progress for display ${displayId}, skipping`);
      return false;
    }
    
    // Get the display's current timeline position
    const displayStmt = queueDb.prepare('SELECT timeline_position FROM displays WHERE id = ?');
    const display = displayStmt.get(displayId) as any;
    
    if (!display) return false;
    
    const currentPosition = display.timeline_position || 0;
    
    // Check if there are any queued videos at or after the current position
    const queuedStmt = queueDb.prepare(`
      SELECT COUNT(*) as count FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued' AND timeline_position >= ?
    `);
    const queuedCount = (queuedStmt.get(displayId, currentPosition) as any).count;

    if (queuedCount > 0) return false; // Still have videos to play at current position

    // Set flag to prevent concurrent loop starts
    loopStartInProgress.add(displayId);
    
    try {
      console.log(`🔄 Starting new loop for display ${displayId} (position ${currentPosition})`);

      // Get active playlist
      const playlist = PlaylistManager.getActivePlaylist(displayId);
      if (!playlist) return false;

    // Increment loop count
    PlaylistManager.incrementLoopCount(playlist.id);

    // Clear old timeline videos for this display
    const clearStmt = queueDb.prepare(`
      DELETE FROM timeline_videos WHERE display_id = ?
    `);
    clearStmt.run(displayId);

    // Reset timeline position to 0 for new loop
    const resetPositionStmt = queueDb.prepare(`
      UPDATE displays SET timeline_position = 0 WHERE id = ?
    `);
    resetPositionStmt.run(displayId);
    console.log(`🔄 Reset timeline_position to 0 for display ${displayId}`);

    // Populate new timeline with next loop iteration
    await this.populateTimelineVideos(displayId, playlist.id, playlist.loop_count + 1);

    // Check if we actually got any videos in the new loop (check from position 0 since we reset)
    const newQueuedStmt = queueDb.prepare(`
      SELECT COUNT(*) as count FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued' AND timeline_position >= 0
    `);
    const newQueuedCount = (newQueuedStmt.get(displayId) as any).count;
    if (newQueuedCount === 0) {
      console.log(`⚠️ No videos found for new loop ${playlist.loop_count + 1}, resetting video history for fresh start`);
      
      // Clear video history for this display to allow videos to be replayed
      const clearHistoryStmt = queueDb.prepare(`
        DELETE FROM video_history WHERE display_id = ?
      `);
      clearHistoryStmt.run(displayId);
      
      // Try populating again with clean history
      await this.populateTimelineVideos(displayId, playlist.id, playlist.loop_count + 1);
      
      const finalQueuedCount = (newQueuedStmt.get(displayId) as any).count;
      if (finalQueuedCount === 0) {
        console.log(`❌ Still no videos found after clearing history - playlist may have no matching videos`);
        return false;
      }
      
      console.log(`✅ Found ${finalQueuedCount} videos after clearing history`);
    }

    return true;
    
    } finally {
      // Always remove the flag when done, even if there was an error
      loopStartInProgress.delete(displayId);
    }
  }

  // Get timeline progress for display with database counts
  static async getTimelineProgressWithCounts(displayId: string) {
    console.log(`🔍 Getting active playlist for display ${displayId}`);
    const playlist = PlaylistManager.getActivePlaylist(displayId);
    console.log(`🔍 Active playlist found:`, playlist ? playlist.id : 'None');
    if (!playlist) return null;

    const blocks = PlaylistManager.getPlaylistBlocks(playlist.id);
    
    // Get current position
    const positionStmt = queueDb.prepare(`
      SELECT timeline_position FROM displays WHERE id = ?
    `);
    const currentPosition = (positionStmt.get(displayId) as any)?.timeline_position || 0;

    console.log(`📊 Progress calc START: currentPosition=${currentPosition}, totalBlocks=${blocks.length}`);
    console.log(`📊 Block breakdown:`, blocks.map((b, i) => `Block ${i}: ${b.video_count} videos (${b.search_term})`));

    // Calculate which block we're in
    let blockIndex = 0;
    let positionInBlock = 0;
    let totalVideosProcessed = 0;
    let totalVideosInPlaylist = blocks.reduce((sum, b) => sum + b.video_count, 0);
    
    for (let i = 0; i < blocks.length; i++) {
      const blockEnd = totalVideosProcessed + blocks[i].video_count;
      console.log(`📊 Checking block ${i}: totalProcessed=${totalVideosProcessed}, blockEnd=${blockEnd}, condition: ${currentPosition} < ${blockEnd} = ${currentPosition < blockEnd}`);
      if (currentPosition < blockEnd) {
        blockIndex = i;
        positionInBlock = currentPosition - totalVideosProcessed;
        console.log(`📊 ✅ Found block ${blockIndex}, positionInBlock=${positionInBlock}`);
        break;
      }
      totalVideosProcessed += blocks[i].video_count;
    }

    // Handle overflow - if position is beyond all blocks, use last block
    if (currentPosition >= totalVideosInPlaylist && blocks.length > 0) {
      console.log(`📊 ⚠️ OVERFLOW: position ${currentPosition} >= total ${totalVideosInPlaylist}, using last block`);
      blockIndex = blocks.length - 1;
      positionInBlock = blocks[blockIndex]?.video_count || 0;
    }

    const currentBlock = blocks[blockIndex] || blocks[0];
    
    // Clamp positionInBlock to not exceed block size
    const clampedPositionInBlock = currentBlock ? Math.min(positionInBlock, currentBlock.video_count - 1) : 0;
    const blockProgress = currentBlock ? (clampedPositionInBlock / currentBlock.video_count) * 100 : 0;
    
    console.log(`📊 Progress calc FINAL: position=${currentPosition}, block=${blockIndex}/${blocks.length}, posInBlock=${clampedPositionInBlock}/${positionInBlock}, blockSize=${currentBlock?.video_count}, progress=${Math.round(blockProgress)}%`);
    
    // Fetch database counts for each block using cache
    // Process blocks sequentially to avoid overwhelming the database
    const blocksWithCounts = [];
    for (const [index, block] of blocks.entries()) {
      try {
        // Get cached total count from PostgreSQL (or default if cache miss)
        const totalCount = await getCachedDbCount(block.search_term, block.format);

        // Query SQLite for watched videos count (always fresh)
        let seenCount = 0;
        try {
          // Get watched video IDs for this search term and display from SQLite
          const watchedVideosStmt = queueDb.prepare(`
            SELECT DISTINCT vh.video_id 
            FROM video_history vh
            JOIN playlist_blocks pb ON vh.block_id = pb.id
            WHERE pb.search_term = ? AND vh.display_id = ?
          `);
          const watchedVideos = watchedVideosStmt.all(block.search_term, displayId);
          seenCount = watchedVideos.length;
        } catch (error) {
          console.error(`Error querying SQLite for watched videos:`, error);
          seenCount = 0;
        }
        
        blocksWithCounts.push({
          id: block.id,
          name: block.search_term,
          videoCount: block.video_count,
          isActive: index === blockIndex,
          isCompleted: index < blockIndex,
          timesPlayed: block.times_played,
          totalAvailable: totalCount,
          seenCount: seenCount,
          format: block.format
        });
      } catch (error) {
        console.error(`Error fetching counts for block ${block.search_term}:`, error);
        blocksWithCounts.push({
          id: block.id,
          name: block.search_term,
          videoCount: block.video_count,
          isActive: index === blockIndex,
          isCompleted: index < blockIndex,
          timesPlayed: block.times_played,
          totalAvailable: 100, // Default fallback
          seenCount: 0,
          format: block.format
        });
      }
    }
    
    return {
      playlistId: playlist.id, // Include playlist ID in the response
      currentBlock: {
        name: currentBlock?.search_term || '',
        progress: blockProgress,
        currentVideo: Math.min(clampedPositionInBlock + 1, currentBlock?.video_count || 0),
        totalVideos: currentBlock?.video_count || 0
      },
      blocks: blocksWithCounts,
      overallProgress: {
        currentPosition,
        totalInCurrentLoop: playlist.total_videos,
        loopCount: playlist.loop_count
      }
    };
  }

  // Get timeline progress for display (original sync version)
  static getTimelineProgress(displayId: string) {
    console.log(`🔍 Getting active playlist for display ${displayId}`);
    const playlist = PlaylistManager.getActivePlaylist(displayId);
    console.log(`🔍 Active playlist found:`, playlist ? playlist.id : 'None');
    if (!playlist) return null;

    const blocks = PlaylistManager.getPlaylistBlocks(playlist.id);
    
    // Get current position
    const positionStmt = queueDb.prepare(`
      SELECT timeline_position FROM displays WHERE id = ?
    `);
    const currentPosition = (positionStmt.get(displayId) as any)?.timeline_position || 0;

    // Calculate which block we're in
    let blockIndex = 0;
    let positionInBlock = 0;
    let totalVideosProcessed = 0;
    let totalVideosInPlaylist = blocks.reduce((sum, b) => sum + b.video_count, 0);
    
    for (let i = 0; i < blocks.length; i++) {
      const blockEnd = totalVideosProcessed + blocks[i].video_count;
      if (currentPosition < blockEnd) {
        blockIndex = i;
        positionInBlock = currentPosition - totalVideosProcessed;
        break;
      }
      totalVideosProcessed += blocks[i].video_count;
    }

    // Handle overflow - if position is beyond all blocks, use last block
    if (currentPosition >= totalVideosInPlaylist && blocks.length > 0) {
      blockIndex = blocks.length - 1;
      positionInBlock = blocks[blockIndex]?.video_count || 0;
    }

    const currentBlock = blocks[blockIndex] || blocks[0];
    
    // Clamp positionInBlock to not exceed block size
    const clampedPositionInBlock = currentBlock ? Math.min(positionInBlock, currentBlock.video_count - 1) : 0;
    const blockProgress = currentBlock ? (clampedPositionInBlock / currentBlock.video_count) * 100 : 0;
    
    return {
      currentBlock: {
        name: currentBlock?.search_term || '',
        progress: blockProgress,
        currentVideo: Math.min(clampedPositionInBlock + 1, currentBlock?.video_count || 0),
        totalVideos: currentBlock?.video_count || 0
      },
      blocks: blocks.map((block, index) => ({
        name: block.search_term,
        videoCount: block.video_count,
        isActive: index === blockIndex,
        isCompleted: index < blockIndex,
        timesPlayed: block.times_played
      })),
      overallProgress: {
        currentPosition,
        totalInCurrentLoop: playlist.total_videos,
        loopCount: playlist.loop_count
      }
    };
  }

  // Get queued videos for display (for preview)
  static getQueuedVideos(displayId: string, limit: number = 10): TimelineVideo[] {
    const stmt = queueDb.prepare(`
      SELECT * FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued'
      ORDER BY timeline_position ASC
      LIMIT ?
    `);
    
    const rows = stmt.all(displayId, limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      display_id: row.display_id,
      playlist_id: row.playlist_id,
      block_id: row.block_id,
      video_id: row.video_id,
      block_position: row.block_position,
      timeline_position: row.timeline_position,
      loop_iteration: row.loop_iteration,
      status: row.status,
      played_at: row.played_at,
      video_data: row.video_data,
      created_at: row.created_at
    }));
  }

  // Get total videos in a specific block
  static getTotalVideosInBlock(blockId: string): number {
    const stmt = queueDb.prepare(`
      SELECT video_count FROM playlist_blocks WHERE id = ?
    `);
    const result = stmt.get(blockId) as any;
    return result?.video_count || 1;
  }

  // Get all videos for a display (all statuses)
  static getAllVideosForDisplay(displayId: string): TimelineVideo[] {
    const stmt = queueDb.prepare(`
      SELECT * FROM timeline_videos 
      WHERE display_id = ?
      ORDER BY timeline_position ASC
    `);
    
    const rows = stmt.all(displayId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      display_id: row.display_id,
      playlist_id: row.playlist_id,
      block_id: row.block_id,
      video_id: row.video_id,
      block_position: row.block_position,
      timeline_position: row.timeline_position,
      loop_iteration: row.loop_iteration,
      status: row.status,
      played_at: row.played_at,
      video_data: row.video_data,
      created_at: row.created_at
    }));
  }

  // Force populate all blocks immediately - used when display starts
  static async forcePopulateAllBlocks(displayId: string, playlistId: string): Promise<void> {
    console.log(`🚀 Force populating all blocks for display ${displayId}`);
    
    try {
      // Simply call populateTimelineVideos
      await this.populateTimelineVideos(displayId, playlistId, 0);
      console.log(`✅ Force population completed for display ${displayId}`);
    } catch (error) {
      console.error(`❌ Error force populating blocks for display ${displayId}:`, error);
      throw error;
    }
  }

  // Reset blocks to their target video counts
  static resetBlocksToTargetCounts(displayId: string, playlistId: string): void {
    console.log(`🧹 Resetting blocks to target counts for display ${displayId}`);
    
    try {
      const blocks = PlaylistManager.getPlaylistBlocks(playlistId);
      
      const transaction = queueDb.transaction(() => {
        blocks.forEach((block, index) => {
          // Get current count of queued videos in this block
          const countStmt = queueDb.prepare(`
            SELECT COUNT(*) as count FROM timeline_videos 
            WHERE display_id = ? AND block_id = ? AND status = 'queued'
          `);
          const currentCount = (countStmt.get(displayId, block.id) as any).count;
          
          // If we have more videos than we should, remove excess
          if (currentCount > block.video_count) {
            const excess = currentCount - block.video_count;
            console.log(`⚠️ Block "${block.search_term}" has ${currentCount} videos, target is ${block.video_count}, removing ${excess} excess`);
            
            // Delete excess videos (keep the first ones based on block_position)
            const deleteStmt = queueDb.prepare(`
              DELETE FROM timeline_videos 
              WHERE display_id = ? AND block_id = ? AND status = 'queued'
              AND block_position >= ?
            `);
            const deletedCount = deleteStmt.run(displayId, block.id, block.video_count).changes;
            console.log(`🗑️ Deleted ${deletedCount} excess videos from block "${block.search_term}"`);
          }
        });
      });
      
      transaction();
      
      console.log(`✅ Finished resetting blocks to target counts for display ${displayId}`);
    } catch (error) {
      console.error(`❌ Error resetting blocks to target counts for display ${displayId}:`, error);
      throw error;
    }
  }
}
