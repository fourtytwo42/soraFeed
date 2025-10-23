import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';

// GET /api/playlists/[id] - Get playlist with blocks
export async function GET(
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

    const blocks = PlaylistManager.getPlaylistBlocks(id);
    
    return NextResponse.json({
      ...playlist,
      blocks
    });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist' },
      { status: 500 }
    );
  }
}

// PUT /api/playlists/[id] - Update playlist
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name } = await request.json();
    
    const playlist = PlaylistManager.getPlaylist(id);
    if (!playlist) {
      return NextResponse.json(
        { error: 'Playlist not found' },
        { status: 404 }
      );
    }

    if (name && typeof name === 'string') {
      PlaylistManager.updatePlaylistName(id, name);
    }
    
    const updatedPlaylist = PlaylistManager.getPlaylist(id);
    return NextResponse.json(updatedPlaylist);
  } catch (error) {
    console.error('Error updating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to update playlist' },
      { status: 500 }
    );
  }
}

// DELETE /api/playlists/[id] - Delete playlist
export async function DELETE(
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

    PlaylistManager.deletePlaylist(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return NextResponse.json(
      { error: 'Failed to delete playlist' },
      { status: 500 }
    );
  }
}
