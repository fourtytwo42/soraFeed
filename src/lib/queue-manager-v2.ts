import { queueDb } from './sqlite';
import { getClient, releaseClient } from './db';
import { TimelineVideo, VideoHistory } from '@/types/timeline';
import { SoraFeedItem } from '@/types/sora';
import { PlaylistManager } from './playlist-manager';
import { v4 as uuidv4 } from 'uuid';

// Simple in-memory cache with TTL
const dbCountCache = new Map<string, { count: number; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export class QueueManagerV2 {
  
  /**
   * Fast video count query - simplified and optimized
   * - Single search method (ILIKE only, no OR conditions)
   * - No full-text search (too slow)
   * - Proper caching
   */
  static async getVideoCount(searchTerm: string, format: 'mixed' | 'wide' | 'tall' = 'mixed'): Promise<number> {
    const cacheKey = `${searchTerm}:${format}`;
    const cached = dbCountCache.get(cacheKey);
    
    // Return cached if still valid
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`💾 Cache hit: ${searchTerm} (${format}) = ${cached.count}`);
      return cached.count;
    }
    
    // Skip very short terms
    if (searchTerm.length < 2) {
      return 50;
    }
    
    // For long terms, return cached or estimate
    if (searchTerm.length > 30) {
      const estimate = cached ? cached.count : 1000;
      console.log(`⚡ Using estimate for long term "${searchTerm}": ${estimate}`);
      return estimate;
    }
    
    try {
      const client = await getClient();
      
      // Build format clause
      let formatClause = '';
      if (format === 'wide') {
        formatClause = 'AND width > height';
      } else if (format === 'tall') {
        formatClause = 'AND height > width';
      }
      
      // Simple, fast count query
      const countQuery = `
        SELECT COUNT(*) as total_count
        FROM sora_posts
        WHERE text ILIKE '%' || $1 || '%'
        ${formatClause}
      `;
      
      const startTime = Date.now();
      const result = await client.query(countQuery, [searchTerm]);
      const duration = Date.now() - startTime;
      
      const count = parseInt(result.rows[0].total_count);
      console.log(`📊 Count query: "${searchTerm}" (${format}) = ${count} (${duration}ms)`);
      
      releaseClient(client);
      
      // Cache the result
      dbCountCache.set(cacheKey, { count, timestamp: Date.now() });
      
      return count;
    } catch (error) {
      console.error(`Error counting videos for "${searchTerm}":`, error);
      
      // Return cached value if available
      if (cached) return cached.count;
      
      // Default fallback
      return 1000;
    }
  }
  
  /**
   * Search for videos - optimized single method
   * Random mode: multiple random OFFSET queries
   * Newest mode: simple ORDER BY
   */
  static async searchVideos(
    searchTerm: string,
    count: number,
    mode: 'newest' | 'random' = 'random',
    format: 'mixed' | 'wide' | 'tall' = 'mixed',
    excludeVideoIds: string[] = []
  ): Promise<SoraFeedItem[]> {
    if (!searchTerm || count <= 0) return [];
    
    const client = await getClient();
    
    try {
      // Build format clause
      let formatClause = '';
      if (format === 'wide') {
        formatClause = 'AND p.width > p.height';
      } else if (format === 'tall') {
        formatClause = 'AND p.height > p.width';
      }
      
      // Build exclude clause
      let excludeClause = '';
      if (excludeVideoIds.length > 0) {
        excludeClause = `AND p.id NOT IN (${excludeVideoIds.map((_, i) => `$${i + 3}`).join(', ')})`;
      }
      
      if (mode === 'newest') {
        // Newest mode: simple query with LIMIT
        const query = `
          SELECT 
            p.id, p.text, p.posted_at, p.permalink,
            p.video_url, p.video_url_md, p.thumbnail_url, p.gif_url,
            p.width, p.height,
            c.id as creator_id, c.username, c.display_name,
            c.profile_picture_url, c.follower_count, c.post_count, c.verified
          FROM sora_posts p
          JOIN creators c ON p.creator_id = c.id
          WHERE p.text ILIKE '%' || $1 || '%'
          ${formatClause}
          ${excludeClause}
          ORDER BY p.posted_at DESC
          LIMIT $2
        `;
        
        const params = excludeVideoIds.length > 0 
          ? [searchTerm, count, ...excludeVideoIds]
          : [searchTerm, count];
        
        const result = await client.query(query, params);
        
        return result.rows.map(row => this.mapPostgresRowToSoraFeedItem(row));
      }
      
      // Random mode: multiple random queries
      const selectedVideos: any[] = [];
      const attempts = Math.min(30, Math.ceil(count * 3)); // Try 3x needed videos
      
      // Get total count first
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM sora_posts 
         WHERE text ILIKE '%' || $1 || '%' ${formatClause}`,
        [searchTerm]
      );
      const totalAvailable = parseInt(countResult.rows[0].total);
      
      if (totalAvailable === 0) return [];
      
      for (let i = 0; i < attempts && selectedVideos.length < count; i++) {
        const randomOffset = Math.floor(Math.random() * totalAvailable);
        
        const query = `
          SELECT 
            p.id, p.text, p.posted_at, p.permalink,
            p.video_url, p.video_url_md, p.thumbnail_url, p.gif_url,
            p.width, p.height,
            c.id as creator_id, c.username, c.display_name,
            c.profile_picture_url, c.follower_count, c.post_count, c.verified
          FROM sora_posts p
          JOIN creators c ON p.creator_id = c.id
          WHERE p.text ILIKE '%' || $1 || '%'
          ${formatClause}
          ${excludeClause}
          ORDER BY p.posted_at DESC
          LIMIT 1 OFFSET $2
        `;
        
        const params = excludeVideoIds.length > 0
          ? [searchTerm, randomOffset, ...excludeVideoIds]
          : [searchTerm, randomOffset];
        
        const result = await client.query(query, params);
        
        if (result.rows.length > 0) {
          const video = result.rows[0];
          if (!selectedVideos.some(v => v.id === video.id)) {
            selectedVideos.push(video);
          }
        }
      }
      
      console.log(`🎲 Random search: selected ${selectedVideos.length} from ${attempts} attempts`);
      
      return selectedVideos.map(row => this.mapPostgresRowToSoraFeedItem(row));
    } finally {
      releaseClient(client);
    }
  }
  
  /**
   * Map PostgreSQL row to SoraFeedItem
   */
  private static mapPostgresRowToSoraFeedItem(row: any): SoraFeedItem {
    return {
      id: row.id,
      post: {
        id: row.id,
        text: row.text,
        posted_at: row.posted_at,
        permalink: row.permalink,
        attachments: [{
          generation_id: null,
          task_id: null,
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
        follower_count: row.follower_count,
        post_count: row.post_count,
        verified: row.verified
      }
    };
  }
  
  /**
   * Timeline management - centralized service
   */
  static async populateTimeline(
    displayId: string,
    playlistId: string,
    loopIteration: number = 0
  ): Promise<void> {
    console.log(`🎵 Populating timeline for playlist ${playlistId}, loop ${loopIteration}`);
    
    // 1. Clear existing timeline
    this.clearTimeline(displayId);
    
    // 2. Get blocks
    const blocks = PlaylistManager.getPlaylistBlocks(playlistId);
    let timelinePosition = 0;
    
    // 3. Populate each block
    const transaction = queueDb.transaction(() => {
      const stmt = queueDb.prepare(`
        INSERT INTO timeline_videos (
          id, display_id, playlist_id, block_id, video_id,
          block_position, timeline_position, loop_iteration,
          status, video_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
      `);
      
      for (const block of blocks) {
        // This would call the optimized search
        // For now, this is the structure
        console.log(`📦 Would populate block: ${block.search_term}`);
      }
    });
    
    transaction();
  }
  
  private static clearTimeline(displayId: string): void {
    queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(displayId);
    console.log(`🗑️ Cleared timeline for display ${displayId}`);
  }
}
