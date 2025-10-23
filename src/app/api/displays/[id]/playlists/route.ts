import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';
import { DisplayManager } from '@/lib/display-manager';

// GET /api/displays/[id]/playlists - Get all playlists for a display
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const display = DisplayManager.getDisplay(id);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }

    const playlists = PlaylistManager.getPlaylistsForDisplay(id);
    const activePlaylist = PlaylistManager.getActivePlaylist(id);
    
    return NextResponse.json({
      playlists,
      activePlaylist
    });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    );
  }
}
