import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';
import { QueueManager } from '@/lib/queue-manager';
import { BlockDefinition } from '@/types/timeline';

// POST /api/playlists - Create new playlist
export async function POST(request: NextRequest) {
  try {
    const { displayId, name, blocks } = await request.json();
    
    if (!displayId || !name || !blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { error: 'displayId, name, and blocks are required' },
        { status: 400 }
      );
    }

    // Validate blocks
    for (const block of blocks) {
      if (!block.searchTerm || !block.videoCount || !block.fetchMode) {
        return NextResponse.json(
          { error: 'Each block must have searchTerm, videoCount, and fetchMode' },
          { status: 400 }
        );
      }
      if (block.format && !['mixed', 'wide', 'tall'].includes(block.format)) {
        return NextResponse.json(
          { error: 'Invalid format for block' },
          { status: 400 }
        );
      }
    }

    const playlist = PlaylistManager.createPlaylist(displayId, name, blocks as BlockDefinition[]);
    
    // Populate initial timeline videos
    await QueueManager.populateTimelineVideos(displayId, playlist.id, 0);
    
    return NextResponse.json(playlist, { status: 201 });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to create playlist' },
      { status: 500 }
    );
  }
}
