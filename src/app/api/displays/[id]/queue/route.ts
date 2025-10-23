import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/lib/queue-manager';

// GET /api/displays/[id]/queue - Get upcoming videos in queue
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: displayId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    // Get upcoming queued videos
    const upcomingVideos = QueueManager.getUpcomingVideos(displayId, limit);

    return NextResponse.json({
      upcomingVideos,
      total: upcomingVideos.length
    });
  } catch (error) {
    console.error('Error fetching queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue' },
      { status: 500 }
    );
  }
}
