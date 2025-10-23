import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';
import { QueueManager } from '@/lib/queue-manager';

// POST /api/poll/[code] - VM client polling endpoint
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { status, currentVideoId, position } = await request.json();
    
    const display = DisplayManager.getDisplay(code);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }

    // Update display status
    DisplayManager.updateDisplayStatus(code, {
      status,
      current_video_id: currentVideoId,
      current_position: position
    });

    // Get pending commands
    const commands = DisplayManager.getAndClearCommands(code);
    
    // Get next video if needed
    let nextVideo = null;
    if (status === 'idle' || !currentVideoId) {
      const timelineVideo = QueueManager.getNextTimelineVideo(code);
      if (timelineVideo) {
        nextVideo = {
          ...timelineVideo,
          video_data: timelineVideo.video_data ? JSON.parse(timelineVideo.video_data) : null
        };
      } else {
        // Check if we need to start a new loop
        const newLoopStarted = await QueueManager.checkAndStartNewLoop(code);
        if (newLoopStarted) {
          const newTimelineVideo = QueueManager.getNextTimelineVideo(code);
          if (newTimelineVideo) {
            nextVideo = {
              ...newTimelineVideo,
              video_data: newTimelineVideo.video_data ? JSON.parse(newTimelineVideo.video_data) : null
            };
          }
        }
      }
    }

    // Get timeline progress for WebSocket updates
    const progress = QueueManager.getTimelineProgress(code);

    return NextResponse.json({
      commands,
      nextVideo,
      displayName: display.name,
      progress,
      status: 'ok'
    });
  } catch (error) {
    console.error('Error in poll endpoint:', error);
    return NextResponse.json(
      { error: 'Poll failed' },
      { status: 500 }
    );
  }
}

// GET /api/poll/[code] - Get display status (for admin)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    
    const display = DisplayManager.getDisplay(code);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }

    const isOnline = DisplayManager.isDisplayOnline(display);
    const progress = QueueManager.getTimelineProgress(code);
    
    return NextResponse.json({
      display: {
        ...display,
        isOnline
      },
      progress
    });
  } catch (error) {
    console.error('Error fetching display status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch display status' },
      { status: 500 }
    );
  }
}
