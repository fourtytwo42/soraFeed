import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/lib/queue-manager';
import { PlaylistManager } from '@/lib/playlist-manager';

// POST /api/admin/reset-blocks/[displayId] - Reset blocks to their target video counts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ displayId: string }> }
) {
  try {
    const { displayId } = await params;
    
    console.log(`🧹 Resetting blocks to target counts for display ${displayId}`);
    
    // Get active playlist
    const playlist = PlaylistManager.getActivePlaylist(displayId);
    if (!playlist) {
      return NextResponse.json(
        { error: 'No active playlist found for display' },
        { status: 404 }
      );
    }
    
    // Reset blocks to target counts
    QueueManager.resetBlocksToTargetCounts(displayId, playlist.id);
    
    return NextResponse.json({
      success: true,
      message: `Reset blocks to target counts for display ${displayId}`,
      playlistId: playlist.id
    });
    
  } catch (error) {
    console.error('Error resetting blocks:', error);
    return NextResponse.json(
      { error: 'Failed to reset blocks' },
      { status: 500 }
    );
  }
}
