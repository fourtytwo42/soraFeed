import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';
import { QueueManager } from '@/lib/queue-manager';
import { PlaylistManager } from '@/lib/playlist-manager';
import { queueDb } from '@/lib/sqlite';

// POST /api/poll/[code] - VM client polling endpoint
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { status, currentVideoId, currentTimelineVideoId, position } = await request.json();
    
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
      current_position: position,
      last_video_start_time: currentVideoId !== display.current_video_id ? Date.now() : display.last_video_start_time
    });

    // Get pending commands
    const commands = DisplayManager.getAndClearCommands(code);
    
    // Get next video - always check for next video to enable seamless transitions
    let nextVideo = null;
    let timelineVideo = QueueManager.getNextTimelineVideo(code);
    
    console.log(`📊 Poll check - currentTimelineVideoId: ${currentTimelineVideoId?.slice(-6)}, nextTimelineVideo.id: ${timelineVideo?.id.slice(-6)}`);
    
    // If no timeline video found, check if we need to repopulate timeline from playlist
    // Only repopulate if the display is actually playing, not if it's stopped
    if (!timelineVideo) {
      console.log(`🔄 No timeline videos found, checking if we need to repopulate from playlist`);
      
      // Check if display is in a playing state before repopulating
      if (display.playback_state === 'playing' || display.playback_state === 'paused') {
        const playlist = PlaylistManager.getActivePlaylist(code);
        if (playlist) {
          console.log(`📋 Found active playlist ${playlist.id}, repopulating timeline videos`);
          // Clear existing timeline videos before repopulating
          queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(code);
          console.log(`🗑️ Cleared existing timeline videos for display ${code}`);
          await QueueManager.populateTimelineVideos(code, playlist.id, 0);
          timelineVideo = QueueManager.getNextTimelineVideo(code);
          console.log(`✅ Timeline repopulated, next video: ${timelineVideo?.video_id.slice(-6)}`);
        }
      } else {
        console.log(`⏸️ Display is stopped (${display.playback_state}), not repopulating timeline videos`);
      }
    }
    
    // Only return nextVideo if the display is actually playing or paused
    if (display.playback_state === 'playing' || display.playback_state === 'paused') {
      if (timelineVideo) {
        // Only return nextVideo if it's different from current timeline video (by timeline ID, not video_id)
        if (!currentTimelineVideoId || timelineVideo.id !== currentTimelineVideoId) {
          console.log(`✅ Returning nextVideo: ${timelineVideo.video_id.slice(-6)} (timeline ID: ${timelineVideo.id.slice(-6)})`);
          // Get the total videos in the current block
          const totalVideosInBlock = QueueManager.getTotalVideosInBlock(timelineVideo.block_id);
          nextVideo = {
            ...timelineVideo,
            video_data: timelineVideo.video_data ? JSON.parse(timelineVideo.video_data) : null,
            totalVideosInBlock
          };
        } else {
          console.log(`⏭️ Skipping - same as current timeline video`);
          
          // Check if we should auto-advance stuck videos
          // If the same video has been playing for more than 30 seconds, auto-advance it
          const videoStartTime = display.last_video_start_time;
          const now = Date.now();
          const videoDuration = now - (videoStartTime || now);
          
          if (videoDuration > 30000) { // 30 seconds
            console.log(`🔄 Auto-advancing stuck video after ${Math.round(videoDuration/1000)}s`);
            QueueManager.markVideoPlayed(timelineVideo.id);
            
            // Get the next video after marking current as played
            const nextTimelineVideo = QueueManager.getNextTimelineVideo(code);
            if (nextTimelineVideo) {
              console.log(`✅ Auto-advanced to next video: ${nextTimelineVideo.video_id.slice(-6)}`);
              const totalVideosInBlock = QueueManager.getTotalVideosInBlock(nextTimelineVideo.block_id);
              nextVideo = {
                ...nextTimelineVideo,
                video_data: nextTimelineVideo.video_data ? JSON.parse(nextTimelineVideo.video_data) : null,
                totalVideosInBlock
              };
            }
          }
        }
      } else {
        // Check if we need to start a new loop
        const newLoopStarted = await QueueManager.checkAndStartNewLoop(code);
        if (newLoopStarted) {
          const newTimelineVideo = QueueManager.getNextTimelineVideo(code);
          if (newTimelineVideo) {
            // Get the total videos in the current block
            const totalVideosInBlock = QueueManager.getTotalVideosInBlock(newTimelineVideo.block_id);
            nextVideo = {
              ...newTimelineVideo,
              video_data: newTimelineVideo.video_data ? JSON.parse(newTimelineVideo.video_data) : null,
              totalVideosInBlock
            };
          }
        }
      }
    } else {
      console.log(`⏸️ Display is stopped (${display.playback_state}), not returning nextVideo`);
    }

    // Get timeline progress for WebSocket updates
    const progress = QueueManager.getTimelineProgress(code);

    return NextResponse.json({
      commands,
      nextVideo,
      displayName: display.name,
      progress,
      status: 'ok',
      // Include playback state from database (source of truth)
      playbackState: {
        state: display.playback_state,
        isPlaying: display.is_playing,
        isMuted: display.is_muted,
        videoPosition: display.video_position,
        lastStateChange: display.last_state_change
      }
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
