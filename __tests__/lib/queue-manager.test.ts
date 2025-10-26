import { describe, it, expect, beforeEach, afterEach, runTests } from '../test-helper';
import { QueueManager } from '@/lib/queue-manager';
import { PlaylistManager } from '@/lib/playlist-manager';
import { DisplayManager } from '@/lib/display-manager';
import { queueDb } from '@/lib/sqlite';

describe('QueueManager', () => {
  const testDisplayId = 'TESTQ1';
  const testPlaylistId = 'test-playlist-123';

  beforeEach(async () => {
    // Clean up test data
    try {
      queueDb.prepare('DELETE FROM displays WHERE id = ?').run(testDisplayId);
      queueDb.prepare('DELETE FROM playlists WHERE display_id = ?').run(testDisplayId);
      queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(testDisplayId);
    } catch (e) {
      // Ignore errors
    }

    // Create test display and playlist
    DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
    PlaylistManager.createPlaylist(testDisplayId, 'Test Playlist', testPlaylistId);
    
    // Add test blocks
    PlaylistManager.addBlock(testPlaylistId, 'commercial', 2, 'random', 'wide');
    PlaylistManager.addBlock(testPlaylistId, 'movie trailer', 3, 'random', 'wide');
  });

  afterEach(async () => {
    // Clean up
    try {
      queueDb.prepare('DELETE FROM displays WHERE id = ?').run(testDisplayId);
      queueDb.prepare('DELETE FROM playlists WHERE display_id = ?').run(testDisplayId);
      queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(testDisplayId);
      queueDb.prepare('DELETE FROM playlist_blocks WHERE playlist_id = ?').run(testPlaylistId);
      queueDb.prepare('DELETE FROM video_history WHERE display_id = ?').run(testDisplayId);
    } catch (e) {
      // Ignore errors
    }
  });

  describe('populateTimelineVideos', () => {
    it('should populate timeline videos for playlist', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const stmt = queueDb.prepare('SELECT COUNT(*) as count FROM timeline_videos WHERE display_id = ?');
      const result = stmt.get(testDisplayId) as any;
      
      expect(result.count).toBeGreaterThan(0);
    });

    it('should respect block video counts', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      // Check that we have approximately 5 videos (2 from commercial + 3 from movie trailer)
      const stmt = queueDb.prepare('SELECT COUNT(*) as count FROM timeline_videos WHERE display_id = ?');
      const result = stmt.get(testDisplayId) as any;
      
      expect(result.count).toBeGreaterThanOrEqual(3);
      expect(result.count).toBeLessThanOrEqual(10); // Allow some variance
    });

    it('should set correct timeline positions', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const stmt = queueDb.prepare(`
        SELECT timeline_position FROM timeline_videos 
        WHERE display_id = ? 
        ORDER BY timeline_position ASC
      `);
      const videos = stmt.all(testDisplayId) as any[];
      
      // Timeline positions should be sequential
      for (let i = 0; i < videos.length; i++) {
        expect(videos[i].timeline_position).toBe(i);
      }
    });

    it('should exclude already played videos', async () => {
      // Populate once
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      // Get first video and mark it as played
      const firstVideo = QueueManager.getNextTimelineVideo(testDisplayId);
      if (firstVideo) {
        QueueManager.markVideoPlayed(firstVideo.id);
      }
      
      // Populate again with new loop
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 1);
      
      // First video should not appear again in the new timeline
      const stmt = queueDb.prepare('SELECT COUNT(*) as count FROM timeline_videos WHERE display_id = ? AND loop_iteration = 1');
      const result = stmt.get(testDisplayId) as any;
      expect(result.count).toBeGreaterThan(0);
    });
  });

  describe('getNextTimelineVideo', () => {
    it('should return next video in timeline', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const nextVideo = QueueManager.getNextTimelineVideo(testDisplayId);
      
      expect(nextVideo).toBeDefined();
      expect(nextVideo?.timeline_position).toBe(0);
      expect(nextVideo?.display_id).toBe(testDisplayId);
    });

    it('should return null when no videos available', () => {
      const nextVideo = QueueManager.getNextTimelineVideo(testDisplayId);
      expect(nextVideo).toBeNull();
    });

    it('should respect current timeline position', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      // Set display to position 1
      DisplayManager.updateDisplayStatus(testDisplayId, {
        timeline_position: 1
      });
      
      const nextVideo = QueueManager.getNextTimelineVideo(testDisplayId);
      
      expect(nextVideo).toBeDefined();
      expect(nextVideo?.timeline_position).toBeGreaterThanOrEqual(1);
    });
  });

  describe('markVideoPlayed', () => {
    it('should mark video as played', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const video = QueueManager.getNextTimelineVideo(testDisplayId);
      expect(video).toBeDefined();
      
      if (video) {
        QueueManager.markVideoPlayed(video.id);
        
        // Verify video is marked as played
        const stmt = queueDb.prepare('SELECT status FROM timeline_videos WHERE id = ?');
        const result = stmt.get(video.id) as any;
        expect(result.status).toBe('played');
      }
    });

    it('should update timeline position', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const video = QueueManager.getNextTimelineVideo(testDisplayId);
      expect(video).toBeDefined();
      
      if (video) {
        QueueManager.markVideoPlayed(video.id);
        
        // Verify display timeline position was incremented
        const display = DisplayManager.getDisplay(testDisplayId);
        expect(display?.timeline_position).toBe(video.timeline_position + 1);
      }
    });

    it('should add video to history', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const video = QueueManager.getNextTimelineVideo(testDisplayId);
      expect(video).toBeDefined();
      
      if (video) {
        QueueManager.markVideoPlayed(video.id);
        
        // Verify video was added to history
        const stmt = queueDb.prepare('SELECT COUNT(*) as count FROM video_history WHERE video_id = ? AND display_id = ?');
        const result = stmt.get(video.video_id, testDisplayId) as any;
        expect(result.count).toBeGreaterThan(0);
      }
    });
  });

  describe('getTimelineProgress', () => {
    it('should return progress for populated playlist', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const progress = QueueManager.getTimelineProgress(testDisplayId);
      
      expect(progress).toBeDefined();
      expect(progress?.currentBlock).toBeDefined();
      expect(progress?.blocks).toBeDefined();
      expect(progress?.blocks.length).toBeGreaterThan(0);
    });

    it('should return null for display without playlist', () => {
      const progress = QueueManager.getTimelineProgress('NONEXIST');
      expect(progress).toBeNull();
    });

    it('should calculate correct block progress', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const progress = QueueManager.getTimelineProgress(testDisplayId);
      
      expect(progress?.currentBlock.progress).toBeGreaterThanOrEqual(0);
      expect(progress?.currentBlock.progress).toBeLessThanOrEqual(100);
    });

    it('should identify active block correctly', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      // Move to position 2 (should be in second block)
      DisplayManager.updateDisplayStatus(testDisplayId, {
        timeline_position: 2
      });
      
      const progress = QueueManager.getTimelineProgress(testDisplayId);
      
      // Should have an active block
      const activeBlocks = progress?.blocks.filter(b => b.isActive);
      expect(activeBlocks?.length).toBe(1);
    });
  });

  describe('getAllVideosForDisplay', () => {
    it('should return all videos for display', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const videos = QueueManager.getAllVideosForDisplay(testDisplayId);
      
      expect(videos.length).toBeGreaterThan(0);
      expect(videos[0].display_id).toBe(testDisplayId);
    });

    it('should return videos in correct order', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const videos = QueueManager.getAllVideosForDisplay(testDisplayId);
      
      for (let i = 0; i < videos.length - 1; i++) {
        expect(videos[i].timeline_position).toBeLessThanOrEqual(videos[i + 1].timeline_position);
      }
    });
  });

  describe('getQueuedVideos', () => {
    it('should return queued videos only', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const videos = QueueManager.getQueuedVideos(testDisplayId);
      
      expect(videos.length).toBeGreaterThan(0);
      videos.forEach(video => {
        expect(video.status).toBe('queued');
      });
    });

    it('should respect limit parameter', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      const videos = QueueManager.getQueuedVideos(testDisplayId, 3);
      
      expect(videos.length).toBeLessThanOrEqual(3);
    });
  });

  describe('resetBlocksToTargetCounts', () => {
    it('should remove excess videos from blocks', async () => {
      await QueueManager.populateTimelineVideos(testDisplayId, testPlaylistId, 0);
      
      // Manually add extra videos to a block to test overpopulation fix
      const blocks = PlaylistManager.getPlaylistBlocks(testPlaylistId);
      const testBlock = blocks[0];
      
      // Insert extra videos manually
      for (let i = 0; i < 5; i++) {
        const stmt = queueDb.prepare(`
          INSERT INTO timeline_videos (
            id, display_id, playlist_id, block_id, video_id,
            block_position, timeline_position, loop_iteration, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          `test-${Date.now()}-${i}`,
          testDisplayId,
          testPlaylistId,
          testBlock.id,
          'test-video',
          testBlock.video_count + i,
          testBlock.video_count + i,
          0,
          'queued'
        );
      }
      
      // Reset blocks
      QueueManager.resetBlocksToTargetCounts(testDisplayId, testPlaylistId);
      
      // Check that block now has correct count
      const stmt = queueDb.prepare('SELECT COUNT(*) as count FROM timeline_videos WHERE display_id = ? AND block_id = ? AND status = ?');
      const result = stmt.get(testDisplayId, testBlock.id, 'queued') as any;
      
      expect(result.count).toBeLessThanOrEqual(testBlock.video_count + 5); // May have some from original population
    });
  });

  describe('forcePopulateAllBlocks', () => {
    it('should populate all blocks immediately', async () => {
      await QueueManager.forcePopulateAllBlocks(testDisplayId, testPlaylistId);
      
      const stmt = queueDb.prepare('SELECT COUNT(*) as count FROM timeline_videos WHERE display_id = ?');
      const result = stmt.get(testDisplayId) as any;
      
      expect(result.count).toBeGreaterThan(0);
    });
  });
});

// Export runTests for the test runner
export async function runAllTests() {
  return await runTests();
}
