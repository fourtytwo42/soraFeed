import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/lib/queue-manager';
import { DisplayManager } from '@/lib/display-manager';

// GET /api/timeline/[displayId] - Get timeline progress and queue
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ displayId: string }> }
) {
  try {
    const { displayId } = await params;
    
    const display = DisplayManager.getDisplay(displayId);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }

    console.log(`📊 Getting timeline progress for display ${displayId}`);
    const progress = await QueueManager.getTimelineProgressWithCounts(displayId);
    console.log(`📊 Timeline progress result:`, progress ? 'Found' : 'None');
    const queuedVideos = QueueManager.getQueuedVideos(displayId, 10);
    
    return NextResponse.json({
      progress,
      queuedVideos: queuedVideos.map(video => ({
        ...video,
        video_data: video.video_data ? JSON.parse(video.video_data) : null
      }))
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timeline' },
      { status: 500 }
    );
  }
}
