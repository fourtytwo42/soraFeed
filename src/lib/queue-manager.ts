import { queueDb } from './sqlite';
import { getClient } from './db'; // PostgreSQL connection for scanner data
import { TimelineVideo, VideoHistory } from '@/types/timeline';
import { SoraFeedItem } from '@/types/sora';
import { PlaylistManager } from './playlist-manager';
import { v4 as uuidv4 } from 'uuid';

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
        ORDER BY RANDOM()
        LIMIT $${excludeVideoIds.length + 2}
      `;
      params = [`%${searchTerm}%`, ...excludeVideoIds, count];
    }

    const result = await client.query(query, params);
    
      // Transform to SoraFeedItem format
      return result.rows.map((row: any) => ({
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

  // Get videos already played for a block across all loops
  static getPlayedVideosForBlock(blockId: string): string[] {
    const stmt = queueDb.prepare(`
      SELECT DISTINCT video_id FROM video_history WHERE block_id = ?
    `);
    const rows = stmt.all(blockId) as any[];
    return rows.map(row => row.video_id);
  }

  // Get the next video in the timeline for a display
  static getNextTimelineVideo(displayId: string): TimelineVideo | null {
    const stmt = queueDb.prepare(`
      SELECT * FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued'
      ORDER BY timeline_position ASC 
      LIMIT 1
    `);
    
    const row = stmt.get(displayId) as any;
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
    
    const blocks = PlaylistManager.getPlaylistBlocks(playlistId);
    let timelinePosition = 0;

    // Process each block sequentially (can't use async inside SQLite transaction)
    for (const block of blocks) {
      console.log(`📦 Processing block: "${block.search_term}" (${block.video_count} videos)`);
      
      // Get videos already played for this block
      const playedVideos = this.getPlayedVideosForBlock(block.id);
      console.log(`🚫 Excluding ${playedVideos.length} already played videos`);

      // Search for new videos
      const videos = await this.searchVideos(
        block.search_term,
        block.video_count,
        block.fetch_mode,
        block.format,
        playedVideos
      );

      console.log(`✅ Found ${videos.length} new videos for "${block.search_term}"`);

      // Add videos to timeline using transaction
      const transaction = queueDb.transaction(() => {
        const stmt = queueDb.prepare(`
          INSERT INTO timeline_videos (
            id, display_id, playlist_id, block_id, video_id,
            block_position, timeline_position, loop_iteration,
            status, video_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
        `);

        videos.forEach((video, index) => {
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
    const stmt = queueDb.prepare(`
      SELECT * FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued'
      ORDER BY timeline_position ASC
      LIMIT 1
    `);
    
    const row = stmt.get(displayId) as any;
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
      
      if (!video) return;

      // Mark as played
      const updateStmt = queueDb.prepare(`
        UPDATE timeline_videos 
        SET status = 'played', played_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      updateStmt.run(timelineVideoId);

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
    // Check if there are any queued videos left
    const queuedStmt = queueDb.prepare(`
      SELECT COUNT(*) as count FROM timeline_videos 
      WHERE display_id = ? AND status = 'queued'
    `);
    const queuedCount = (queuedStmt.get(displayId) as any).count;

    if (queuedCount > 0) return false; // Still have videos in current loop

    console.log(`🔄 Starting new loop for display ${displayId}`);

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

    // Populate new timeline with next loop iteration
    await this.populateTimelineVideos(displayId, playlist.id, playlist.loop_count + 1);

    return true;
  }

  // Get timeline progress for display
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
    let positionInBlock = currentPosition;
    
    for (let i = 0; i < blocks.length; i++) {
      if (positionInBlock < blocks[i].video_count) {
        blockIndex = i;
        break;
      }
      positionInBlock -= blocks[i].video_count;
      blockIndex = i + 1;
    }

    const currentBlock = blocks[blockIndex] || blocks[0];
    
    return {
      currentBlock: {
        name: currentBlock?.search_term || '',
        progress: currentBlock ? (positionInBlock / currentBlock.video_count) * 100 : 0,
        currentVideo: positionInBlock + 1,
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
}
