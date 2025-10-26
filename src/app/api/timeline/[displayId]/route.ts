import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/lib/queue-manager';
import { DisplayManager } from '@/lib/display-manager';
import { PlaylistManager } from '@/lib/playlist-manager';

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

    let nowPlaying: any = null;
    const nowPlayingVideo = display.current_timeline_video_id
      ? QueueManager.getTimelineVideoById(display.current_timeline_video_id)
      : null;

    if (nowPlayingVideo) {
      let parsedVideoData = null;
      if (nowPlayingVideo.video_data) {
        try {
          parsedVideoData = JSON.parse(nowPlayingVideo.video_data);
        } catch (error) {
          console.error('Error parsing now playing video data:', error);
        }
      }

      const block = PlaylistManager.getBlockById(nowPlayingVideo.block_id);
      const totalVideosInBlock = block?.video_count ?? QueueManager.getTotalVideosInBlock(nowPlayingVideo.block_id);

      nowPlaying = {
        timelineId: nowPlayingVideo.id,
        videoId: nowPlayingVideo.video_id,
        blockId: nowPlayingVideo.block_id,
        blockName: block?.search_term ?? null,
        blockPosition: (nowPlayingVideo.block_position ?? 0) + 1,
        totalVideosInBlock,
        videoData: parsedVideoData,
        status: nowPlayingVideo.status
      };
    }
    
    // Return all videos for admin page (not just queued ones)
    let queuedVideos: any[] = [];
    if (display.playback_state === 'playing' || display.playback_state === 'paused') {
      queuedVideos = QueueManager.getAllVideosForDisplay(displayId);
      console.log(`📋 Returning ${queuedVideos.length} total videos for ${display.playback_state} display`);
    } else {
      console.log(`⏸️ Display is ${display.playback_state}, returning empty queued videos`);
    }
    
    return NextResponse.json({
      progress,
      queuedVideos: queuedVideos.map(video => ({
        ...video,
        video_data: video.video_data ? JSON.parse(video.video_data) : null
      })),
      nowPlaying
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timeline' },
      { status: 500 }
    );
  }
}
