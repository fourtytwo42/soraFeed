import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';
import { QueueManager } from '@/lib/queue-manager';
import { queueDb } from '@/lib/sqlite';
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
      
      if (!block.fetchMode) {
        block.fetchMode = 'random'; // Default to random
        console.log(`Block ${i}: Set default fetchMode to 'random'`);
      } else if (!['newest', 'random'].includes(block.fetchMode)) {
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

    // Check existing playlists and if there's an active one
    const existingPlaylists = PlaylistManager.getPlaylistsForDisplay(displayId);
    const isFirstPlaylist = existingPlaylists.length === 0;
    const currentActivePlaylist = PlaylistManager.getActivePlaylist(displayId);
    const hasActivePlaylist = currentActivePlaylist !== null;
    
    console.log(`📋 Creating playlist for display ${displayId}: ${name}, isFirstPlaylist: ${isFirstPlaylist}, existingCount: ${existingPlaylists.length}, hasActive: ${hasActivePlaylist}`);
    
    const playlist = PlaylistManager.createPlaylist(displayId, name, blocks as BlockDefinition[]);
    
    console.log(`✅ Created playlist ${playlist.id} with ${blocks.length} blocks`);
    
    // Automatically activate the new playlist if:
    // 1. It's the first playlist for this display, OR
    // 2. There's no currently active playlist
    if (isFirstPlaylist || !hasActivePlaylist) {
      console.log(`🔄 Auto-activating playlist ${playlist.id} for display ${displayId} (reason: ${isFirstPlaylist ? 'first playlist' : 'no active playlist'})`);
      try {
        PlaylistManager.setActivePlaylist(displayId, playlist.id);
        console.log(`✅ setActivePlaylist called successfully`);
      } catch (error) {
        console.error(`❌ Error calling setActivePlaylist:`, error);
      }
      
      // Verify activation
      const verifyPlaylist = PlaylistManager.getActivePlaylist(displayId);
      console.log(`✅ Auto-activated playlist verification:`, verifyPlaylist ? `Active (${verifyPlaylist.id})` : 'NOT ACTIVE');
      
      if (!verifyPlaylist) {
        console.error(`❌ CRITICAL: Playlist ${playlist.id} was NOT activated!`);
      }
    }
    
    // Clear any existing timeline videos for this display before populating
    queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(displayId);
    console.log(`🗑️ Cleared existing timeline videos for display ${displayId}`);
    
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
