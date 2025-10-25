import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';
import { QueueManager } from '@/lib/queue-manager';
import { queueDb } from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';

// POST /api/playlists/blocks - Add a new block to an existing playlist
export async function POST(request: NextRequest) {
  try {
    const { playlistId, searchTerm, videoCount, format, position } = await request.json();
    
    if (!playlistId || !searchTerm || !videoCount) {
      return NextResponse.json(
        { error: 'playlistId, searchTerm, and videoCount are required' },
        { status: 400 }
      );
    }

    // Validate inputs
    if (typeof searchTerm !== 'string' || searchTerm.trim() === '') {
      return NextResponse.json(
        { error: 'Search term must be a non-empty string' },
        { status: 400 }
      );
    }

    if (typeof videoCount !== 'number' || videoCount < 1) {
      return NextResponse.json(
        { error: 'Video count must be a number greater than 0' },
        { status: 400 }
      );
    }

    if (format && !['mixed', 'wide', 'tall'].includes(format)) {
      return NextResponse.json(
        { error: 'Format must be "mixed", "wide", or "tall"' },
        { status: 400 }
      );
    }

    // Check if playlist exists
    const playlist = PlaylistManager.getPlaylist(playlistId);
    if (!playlist) {
      return NextResponse.json(
        { error: 'Playlist not found' },
        { status: 404 }
      );
    }

    // Get current blocks to determine the new block order
    const currentBlocks = PlaylistManager.getPlaylistBlocks(playlistId);
    const insertPosition = position !== undefined ? Math.max(0, Math.min(position, currentBlocks.length)) : currentBlocks.length;
    
    // Create new block
    const blockId = uuidv4();
    const blockOrder = insertPosition;
    
    // Update block orders for blocks that come after the insertion point
    const transaction = queueDb.transaction(() => {
      // Update block orders for existing blocks
      if (insertPosition < currentBlocks.length) {
        const updateStmt = queueDb.prepare(`
          UPDATE playlist_blocks 
          SET block_order = block_order + 1 
          WHERE playlist_id = ? AND block_order >= ?
        `);
        updateStmt.run(playlistId, insertPosition);
      }

      // Insert new block
      const insertStmt = queueDb.prepare(`
        INSERT INTO playlist_blocks (id, playlist_id, search_term, video_count, fetch_mode, format, block_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(blockId, playlistId, searchTerm.trim(), videoCount, 'random', format || 'mixed', blockOrder);

      // Update playlist totals
      const updatePlaylistStmt = queueDb.prepare(`
        UPDATE playlists 
        SET total_blocks = total_blocks + 1, total_videos = total_videos + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updatePlaylistStmt.run(videoCount, playlistId);
    });

    transaction();

    console.log(`✅ Added new block "${searchTerm}" to playlist ${playlistId} at position ${insertPosition}`);

    // If this is the active playlist, we need to repopulate timeline videos
    const activePlaylist = PlaylistManager.getActivePlaylist(playlist.display_id);
    if (activePlaylist && activePlaylist.id === playlistId) {
      console.log(`🔄 Repopulating timeline videos for active playlist ${playlistId}`);
      
      // Clear existing timeline videos and repopulate
      queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(playlist.display_id);
      await QueueManager.populateTimelineVideos(playlist.display_id, playlistId, 0);
    }

    // Return the new block
    const newBlock = {
      id: blockId,
      playlist_id: playlistId,
      search_term: searchTerm.trim(),
      video_count: videoCount,
      fetch_mode: 'random',
      format: format || 'mixed',
      block_order: blockOrder,
      times_played: 0,
      last_played_at: null
    };

    return NextResponse.json(newBlock, { status: 201 });
  } catch (error) {
    console.error('Error adding block to playlist:', error);
    return NextResponse.json(
      { error: 'Failed to add block to playlist' },
      { status: 500 }
    );
  }
}
