import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';
import { QueueManager } from '@/lib/queue-manager';

// PUT /api/playlists/blocks/[blockId] - Update block properties
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ blockId: string }> }
) {
  try {
    const { blockId } = await params;
    const updates = await request.json();
    
    if (!blockId) {
      return NextResponse.json(
        { error: 'Block ID is required' },
        { status: 400 }
      );
    }

    // Validate updates
    if (updates.search_term !== undefined && (typeof updates.search_term !== 'string' || updates.search_term.trim() === '')) {
      return NextResponse.json(
        { error: 'Search term must be a non-empty string' },
        { status: 400 }
      );
    }
    
    if (updates.video_count !== undefined && (typeof updates.video_count !== 'number' || updates.video_count < 1)) {
      return NextResponse.json(
        { error: 'Video count must be a number greater than 0' },
        { status: 400 }
      );
    }
    
    if (updates.format !== undefined && !['mixed', 'wide', 'tall'].includes(updates.format)) {
      return NextResponse.json(
        { error: 'Format must be mixed, wide, or tall' },
        { status: 400 }
      );
    }

    const existingBlock = PlaylistManager.getBlockById(blockId);
    if (!existingBlock) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    // Update the block
    const updatedBlock = PlaylistManager.updateBlock(blockId, updates);
    if (!updatedBlock) {
      return NextResponse.json(
        { error: 'Failed to update block' },
        { status: 500 }
      );
    }

    const playlist = PlaylistManager.getPlaylist(updatedBlock.playlist_id);
    if (playlist) {
      const activePlaylist = PlaylistManager.getActivePlaylist(playlist.display_id);
      if (activePlaylist && activePlaylist.id === playlist.id) {
        console.log(`🔄 Block ${blockId} updated for active playlist ${playlist.id}; repopulating timeline for display ${playlist.display_id}`);
        await QueueManager.populateTimelineVideos(playlist.display_id, playlist.id, 0);
      }
    }
    
    return NextResponse.json({ success: true, block: updatedBlock });
  } catch (error) {
    console.error('Error updating block:', error);
    return NextResponse.json(
      { error: 'Failed to update block' },
      { status: 500 }
    );
  }
}

// DELETE /api/playlists/blocks/[blockId] - Delete a block
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ blockId: string }> }
) {
  try {
    const { blockId } = await params;
    
    if (!blockId) {
      return NextResponse.json(
        { error: 'Block ID is required' },
        { status: 400 }
      );
    }

    // Get the block to find its playlist
    const block = PlaylistManager.getBlockById(blockId);
    if (!block) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    // Delete the block
    PlaylistManager.deleteBlock(blockId);
    
    // If this is an active playlist, we need to repopulate timeline videos
    const playlist = PlaylistManager.getPlaylist(block.playlist_id);
    if (playlist) {
      const activePlaylist = PlaylistManager.getActivePlaylist(playlist.display_id);
      if (activePlaylist && activePlaylist.id === playlist.id) {
        console.log(`🔄 Repopulating timeline videos after block deletion for active playlist ${playlist.id}`);
        
        // Clear existing timeline videos and repopulate
        const { queueDb } = await import('@/lib/sqlite');
        queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(playlist.display_id);
        await QueueManager.populateTimelineVideos(playlist.display_id, playlist.id, 0);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting block:', error);
    return NextResponse.json(
      { error: 'Failed to delete block' },
      { status: 500 }
    );
  }
}
