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
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      console.log(`Validating block ${i}:`, block);
      
      if (!block.searchTerm || typeof block.searchTerm !== 'string' || block.searchTerm.trim() === '') {
        console.log(`Block ${i} validation failed: invalid searchTerm`);
        return NextResponse.json(
          { error: `Block ${i + 1}: Search term is required and cannot be empty` },
          { status: 400 }
        );
      }
      
      if (!block.videoCount || typeof block.videoCount !== 'number' || block.videoCount < 1) {
        console.log(`Block ${i} validation failed: invalid videoCount`);
        return NextResponse.json(
          { error: `Block ${i + 1}: Video count must be a number greater than 0` },
          { status: 400 }
        );
      }
      
      if (!block.fetchMode || !['newest', 'random'].includes(block.fetchMode)) {
        console.log(`Block ${i} validation failed: invalid fetchMode`);
        return NextResponse.json(
          { error: `Block ${i + 1}: Fetch mode must be 'newest' or 'random'` },
          { status: 400 }
        );
      }
      
      // Set default format if not provided
      if (!block.format) {
        block.format = 'mixed';
        console.log(`Block ${i}: Set default format to 'mixed'`);
      } else if (!['mixed', 'wide', 'tall'].includes(block.format)) {
        console.log(`Block ${i} validation failed: invalid format`);
        return NextResponse.json(
          { error: `Block ${i + 1}: Format must be 'mixed', 'wide', or 'tall'` },
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
