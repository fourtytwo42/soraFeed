import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/lib/queue-manager';

// POST /api/timeline/mark-played - Mark video as played
export async function POST(request: NextRequest) {
  try {
    const { timelineVideoId } = await request.json();
    
    if (!timelineVideoId) {
      return NextResponse.json(
        { error: 'timelineVideoId is required' },
        { status: 400 }
      );
    }

    QueueManager.markVideoPlayed(timelineVideoId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking video as played:', error);
    return NextResponse.json(
      { error: 'Failed to mark video as played' },
      { status: 500 }
    );
  }
}
