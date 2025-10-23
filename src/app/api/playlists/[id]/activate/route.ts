import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';

// POST /api/playlists/[id]/activate - Set playlist as active for display
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const playlist = PlaylistManager.getPlaylist(id);
    if (!playlist) {
      return NextResponse.json(
        { error: 'Playlist not found' },
        { status: 404 }
      );
    }

    PlaylistManager.setActivePlaylist(playlist.display_id, id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error activating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to activate playlist' },
      { status: 500 }
    );
  }
}
