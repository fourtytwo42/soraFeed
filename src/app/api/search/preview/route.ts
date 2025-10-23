import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/lib/queue-manager';

// GET /api/search/preview - Preview videos for a search term
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('term');
    const count = parseInt(searchParams.get('count') || '5');
    const mode = searchParams.get('mode') as 'newest' | 'random' || 'newest';
    const format = searchParams.get('format') as 'mixed' | 'wide' | 'tall' || 'mixed';
    
    if (!searchTerm) {
      return NextResponse.json(
        { error: 'Search term is required' },
        { status: 400 }
      );
    }

    const videos = await QueueManager.searchVideos(searchTerm, count, mode, format);
    
    return NextResponse.json({
      searchTerm,
      mode,
      format,
      count: videos.length,
      videos
    });
  } catch (error) {
    console.error('Error searching videos:', error);
    return NextResponse.json(
      { error: 'Failed to search videos' },
      { status: 500 }
    );
  }
}
