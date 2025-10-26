import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/lib/queue-manager';
import { PlaylistManager } from '@/lib/playlist-manager';

// POST /api/admin/force-populate/[displayId] - Force populate all blocks for a display
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ displayId: string }> }
) {
  try {
    const { displayId } = await params;
    
    console.log(`🚀 Force populating all blocks for display ${displayId}`);
    
    // Get active playlist
    const playlist = PlaylistManager.getActivePlaylist(displayId);
    if (!playlist) {
      return NextResponse.json(
        { error: 'No active playlist found for display' },
        { status: 404 }
      );
    }
    
    // Force populate all blocks
    await QueueManager.forcePopulateAllBlocks(displayId, playlist.id);
    
    return NextResponse.json({
      success: true,
      message: `Force populated all blocks for display ${displayId}`,
      playlistId: playlist.id
    });
    
  } catch (error) {
    console.error('Error force populating blocks:', error);
    return NextResponse.json(
      { error: 'Failed to force populate blocks' },
      { status: 500 }
    );
  }
}
