import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';
import { QueueManager } from '@/lib/queue-manager';
import { BlockDefinition } from '@/types/timeline';

// POST /api/playlists/import - Import playlist from CSV data
export async function POST(request: NextRequest) {
  try {
    const { displayId, blocks, playlistName } = await request.json();
    
    if (!displayId || !blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { error: 'displayId and blocks are required' },
        { status: 400 }
      );
    }

    // Validate blocks
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      
      if (!block.searchTerm || typeof block.searchTerm !== 'string' || block.searchTerm.trim() === '') {
        return NextResponse.json(
          { error: `Block ${i + 1}: Search term is required and cannot be empty` },
          { status: 400 }
        );
      }
      
      if (!block.videoCount || typeof block.videoCount !== 'number' || block.videoCount < 1) {
        return NextResponse.json(
          { error: `Block ${i + 1}: Video count must be a number greater than 0` },
          { status: 400 }
        );
      }
      
      if (!block.fetchMode) {
        block.fetchMode = 'random'; // Default to random
      } else if (!['newest', 'random'].includes(block.fetchMode)) {
        return NextResponse.json(
          { error: `Block ${i + 1}: Fetch mode must be 'newest' or 'random'` },
          { status: 400 }
        );
      }
      
      // Set default format if not provided
      if (!block.format) {
        block.format = 'mixed';
      } else if (!['mixed', 'wide', 'tall'].includes(block.format)) {
        return NextResponse.json(
          { error: `Block ${i + 1}: Format must be 'mixed', 'wide', or 'tall'` },
          { status: 400 }
        );
      }
    }

    // Create new playlist (this will overwrite any existing active playlist)
    const playlist = PlaylistManager.createPlaylist(
      displayId, 
      playlistName || `Imported Playlist ${new Date().toLocaleDateString()}`, 
      blocks as BlockDefinition[]
    );
    
    // Set as active playlist
    PlaylistManager.setActivePlaylist(displayId, playlist.id);
    
    // Populate initial timeline videos
    await QueueManager.populateTimelineVideos(displayId, playlist.id, 0);
    
    console.log(`✅ Imported playlist for display ${displayId} with ${blocks.length} blocks`);
    
    return NextResponse.json({ 
      success: true, 
      playlist,
      message: `Successfully imported ${blocks.length} blocks` 
    });
  } catch (error) {
    console.error('Error importing playlist:', error);
    return NextResponse.json(
      { error: 'Failed to import playlist' },
      { status: 500 }
    );
  }
}
