import { NextRequest, NextResponse } from 'next/server';
import { PlaylistManager } from '@/lib/playlist-manager';

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

    // Update the block
    PlaylistManager.updateBlock(blockId, updates);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating block:', error);
    return NextResponse.json(
      { error: 'Failed to update block' },
      { status: 500 }
    );
  }
}
