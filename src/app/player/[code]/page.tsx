'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SoraFeedItem } from '@/types/sora';
import { TimelineVideo } from '@/types/timeline';
import TVVideoPlayer from '@/components/player/TVVideoPlayer';
import CodeDisplay from '@/components/player/CodeDisplay';
import ConnectedDisplay from '@/components/player/ConnectedDisplay';
import { useVMWebSocket } from '@/hooks/useVMWebSocket';

interface VMState {
  currentVideo: SoraFeedItem | null;
  currentTimelineVideo: TimelineVideo | null;
  displayName: string;
  error: string | null;
  isConnected: boolean;
  hasActivePlaylist: boolean;
}

interface PlaybackState {
  state: 'idle' | 'playing' | 'paused' | 'loading';
  isPlaying: boolean;
  isMuted: boolean;
  videoPosition: number;
  lastStateChange: string;
}

// Generate a random 6-digit alphanumeric code
function generateDisplayCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function VMPlayer() {
  const params = useParams();
  const router = useRouter();
  const urlCode = params.code as string;
  
  const [code, setCode] = useState<string>('');
  const [vmState, setVMState] = useState<VMState>({
    currentVideo: null,
    currentTimelineVideo: null,
    displayName: '',
    error: null,
    isConnected: false,
    hasActivePlaylist: false
  });

  // Playback state from database (source of truth) - start with 'idle' until we get first video
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    state: 'idle',
    isPlaying: false,
    isMuted: true,
    videoPosition: 0,
    lastStateChange: new Date().toISOString()
  });

  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [videoProgress, setVideoProgress] = useState({ currentTime: 0, duration: 0 });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const codeInitialized = useRef(false);

  // Check sessionStorage on mount to restore user interaction state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasInteracted = sessionStorage.getItem('sorafeed-user-interacted') === 'true';
      if (hasInteracted) {
        console.log('✅ Restoring user interaction state from session');
        setNeedsUserInteraction(false);
      }
    }
  }, []);

  // Initialize WebSocket connection only when code is available
  const { isConnected: wsConnected, sendProgressUpdate, sendVideoChange } = useVMWebSocket(code || '');

  // Video progress tracking functions
  const stopVideoProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startVideoProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(() => {
      const videoElement = document.querySelector('video');
      if (videoElement && !videoElement.paused && vmState.currentTimelineVideo) {
        const currentTime = videoElement.currentTime;
        const duration = videoElement.duration;
        
        if (duration > 0) {
          setVideoProgress({ currentTime, duration });
          
          // Send block-aware progress update
          if (wsConnected && vmState.currentTimelineVideo) {
            const videoProgressPercent = (currentTime / duration) * 100;
            
            const totalVideosInBlock = vmState.currentTimelineVideo.totalVideosInBlock || 1;
            
            sendProgressUpdate({
              currentIndex: vmState.currentTimelineVideo.timeline_position,
              totalVideos: totalVideosInBlock,
              playlistName: 'Current Block',
              videoProgress: videoProgressPercent,
              timelinePosition: vmState.currentTimelineVideo.timeline_position,
              blockPosition: vmState.currentTimelineVideo.block_position
            });
          }
        }
      }
    }, 1000); // Update every second
  }, [wsConnected, vmState.currentTimelineVideo, sendProgressUpdate]);

  // Polling function - now reads playback state from database
  const pollServer = useCallback(async () => {
    if (!code) return;
    
    try {
      const response = await fetch(`/api/poll/${code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: playbackState.state,
          currentVideoId: vmState.currentTimelineVideo?.video_id,
          currentTimelineVideoId: vmState.currentTimelineVideo?.id, // Send timeline ID for accurate tracking
          position: playbackState.videoPosition
        })
      });

      if (response.status === 404) {
        // Display not found - could be waiting to be added or was deleted
        const wasConnected = vmState.isConnected;
        if (wasConnected) {
          console.log('🗑️ Display was deleted from system, reverting to code display');
        } else {
          console.log('🔍 Display not found in system yet, waiting for admin to add it');
        }
        
        setVMState(prev => ({
          ...prev,
          error: null,
          isConnected: false,
          currentVideo: null,
          currentTimelineVideo: null,
          displayName: '',
          hasActivePlaylist: false
        }));
        return;
      }

      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }

      const data = await response.json();
      
      // No preloading - just play videos as they come
      
      // Successfully connected to the system!
      setVMState(prev => {
        return {
          ...prev,
          error: null,
          isConnected: true,
          displayName: data.displayName || prev.displayName
        };
      });

      // Update playback state from database (source of truth)
      if (data.playbackState) {
        const newPlaybackState = data.playbackState;
        setPlaybackState(prev => {
          // If this is the first time we're getting a video (was idle and now has video), start playing
          if (prev.state === 'idle' && vmState.currentTimelineVideo === null && data.nextVideo) {
            console.log('🚀 First video received, auto-starting playback');
            // Update the database to reflect we're now playing
            fetch(`/api/displays/${code}/commands`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'play' })
            }).catch(err => console.error('Failed to auto-start playback:', err));
            
            // Always start muted for browser autoplay compliance, then respect server state
            return {
              ...newPlaybackState,
              state: 'playing',
              isPlaying: true,
              isMuted: true  // Always start muted for browser autoplay
            };
          }
          
          // Only update if something actually changed
          // But never let server override our muted state - we control that locally
          if (
            prev.state !== newPlaybackState.state ||
            prev.isPlaying !== newPlaybackState.isPlaying ||
            Math.abs(prev.videoPosition - newPlaybackState.videoPosition) > 1
          ) {
            console.log('📊 Playback state updated from database:', newPlaybackState);
            console.log('🔇 isMuted state:', newPlaybackState.isMuted);
            // Keep our local mute state, don't let server override it
            return {
              ...newPlaybackState,
              isMuted: prev.isMuted // Keep our local mute state
            };
          }
          return prev;
        });
      }
      
      // Process non-playback commands (like 'next', 'stop')
      if (data.commands && data.commands.length > 0) {
        data.commands.forEach((command: any) => {
          if (command.type === 'next') {
            console.log('⏭️ Next video command received');
            handleVideoEnd();
          } else if (command.type === 'stop') {
            console.log('🛑 Stop command received - resetting display state');
            // Reset all state
            setVMState({
              currentVideo: null,
              currentTimelineVideo: null,
              displayName: vmState.displayName,
              error: null,
              isConnected: vmState.isConnected,
              hasActivePlaylist: false
            });
            setPlaybackState({
              state: 'idle',
              isPlaying: false,
              isMuted: true,
              videoPosition: 0,
              lastStateChange: new Date().toISOString()
            });
            setVideoProgress({ currentTime: 0, duration: 0 });
            stopVideoProgressTracking();
          }
        });
      }

      // Load next video if provided
      if (data.nextVideo && (!vmState.currentTimelineVideo || data.nextVideo.id !== vmState.currentTimelineVideo.id)) {
        console.log('🎬 Loading new video:', data.nextVideo.video_id, 'Timeline ID:', data.nextVideo.id.slice(-6));
        console.log('  Current timeline video:', vmState.currentTimelineVideo?.id?.slice(-6));
        
        const videoData = data.nextVideo.video_data;
        
        setVMState(prev => ({
          ...prev,
          currentVideo: videoData,
          currentTimelineVideo: data.nextVideo,
          hasActivePlaylist: true
        }));

        // Send video change to WebSocket
        if (wsConnected && videoData) {
          sendVideoChange({
            id: videoData.post?.id || data.nextVideo.video_id,
            username: videoData.profile?.username || 'Unknown',
            description: (videoData.post?.text || '').substring(0, 100) + ((videoData.post?.text || '').length > 100 ? '...' : ''),
            duration: 0,
            position: 0
          });
        }
      }

    } catch (error: unknown) {
      console.error('❌ Poll error:', error);
      if (!(error instanceof Error) || !error.message?.includes('404')) {
        setVMState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Connection error'
        }));
      }
    }
  }, [code, playbackState.state, vmState.currentTimelineVideo, playbackState.videoPosition, vmState.isConnected, wsConnected, sendVideoChange]);

  // Handle video end
  const handleVideoEnd = useCallback(async () => {
    console.log('🎬 Video ended, marking as played');
    console.log('  Timeline video ID being marked:', vmState.currentTimelineVideo?.id?.slice(-6));
    console.log('  Video ID:', vmState.currentTimelineVideo?.video_id?.slice(-6));
    
    stopVideoProgressTracking();
    
    if (vmState.currentTimelineVideo) {
      try {
        // Mark video as played - this updates the timeline position in the database
        await fetch(`/api/timeline/mark-played`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timelineVideoId: vmState.currentTimelineVideo.id
          })
        });
        
        console.log('✅ Video marked as played, immediately fetching next video');
        
        // Immediately poll for the next video to avoid delay/restart
        pollServer();
        
      } catch (error) {
        console.error('Failed to mark video as played:', error);
      }
    }
  }, [vmState.currentTimelineVideo, stopVideoProgressTracking, pollServer]);

  // Handle autoplay failure
  const handleAutoplayBlocked = useCallback(() => {
    // Check if user has already interacted in this session
    const hasInteractedInSession = typeof window !== 'undefined' && 
      sessionStorage.getItem('sorafeed-user-interacted') === 'true';
    
    if (hasInteractedInSession) {
      console.log('✅ User already interacted in this session, not showing Click to Play');
      return;
    }
    
    console.log('🚫 Video ready but needs user interaction to play');
    setNeedsUserInteraction(true);
  }, []);

  // Handle user interaction to start playback
  const handleUserInteraction = useCallback(async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('👆 User interaction detected, enabling auto-play for future videos');
    setNeedsUserInteraction(false);
    
    // Store in sessionStorage that user has interacted
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('sorafeed-user-interacted', 'true');
    }
    
    // Update database to start playback
    try {
      await fetch(`/api/displays/${code}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'play' })
      });
      
      await fetch(`/api/displays/${code}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'unmute' })
      });
    } catch (error) {
      console.error('Failed to update playback state:', error);
    }
  }, [code]);

  // Handle video ready
  const handleVideoReady = useCallback(() => {
    console.log('✅ Video ready');
    // Video is ready, but playback state is controlled by database
  }, []);

  // Handle manual video click (click and forget)
  const handleVideoClick = useCallback(async () => {
    console.log('🖱️ Video clicked');
    
    // If unmuted, do nothing - we don't want to pause/mute on click
    if (!playbackState.isMuted) {
      console.log('🔇 Video is unmuted, ignoring click');
      return;
    }
    
    console.log('🖱️ Toggling playback state in database');
    try {
      // Toggle playback state in database
      const command = playbackState.isPlaying ? 'pause' : 'play';
      await fetch(`/api/displays/${code}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: command })
      });
    } catch (error) {
      console.error('Failed to toggle playback state:', error);
    }
  }, [code, playbackState.isPlaying, playbackState.isMuted]);

  // Handle mute toggle
  const handleMuteToggle = useCallback(async () => {
    console.log('🔇 Mute toggle clicked');
    
    // Immediately update local state for responsive UI
    setPlaybackState(prev => {
      const newMutedState = !prev.isMuted;
      console.log('🔇 Toggling mute state:', prev.isMuted, '->', newMutedState);
      return {
        ...prev,
        isMuted: newMutedState
      };
    });
    
    try {
      // Toggle mute state in database
      const command = playbackState.isMuted ? 'unmute' : 'mute';
      await fetch(`/api/displays/${code}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: command })
      });
    } catch (error) {
      console.error('Failed to toggle mute state:', error);
      // Revert local state if database update failed
      setPlaybackState(prev => ({
        ...prev,
        isMuted: !prev.isMuted
      }));
    }
  }, [code, playbackState.isMuted]);

  // Start/stop progress tracking based on playback state
  useEffect(() => {
    if (playbackState.isPlaying && playbackState.state === 'playing') {
      startVideoProgressTracking();
    } else {
      stopVideoProgressTracking();
    }
    
    // If display is stopped, clear current video
    if (playbackState.state === 'idle') {
      console.log('🛑 Display stopped, clearing current video');
      setVMState(prev => ({
        ...prev,
        currentVideo: null,
        currentTimelineVideo: null,
        hasActivePlaylist: false
      }));
    }
  }, [playbackState.isPlaying, playbackState.state, startVideoProgressTracking, stopVideoProgressTracking]);

  // Initialize code and display
  useEffect(() => {
    if (codeInitialized.current) return;
    codeInitialized.current = true;

    const initializeCode = () => {
      const storedCode = localStorage.getItem('sorafeed-display-code');
      
      if (storedCode) {
        console.log('🔑 Using stored display code:', storedCode);
        setCode(storedCode);
        
        if (urlCode !== storedCode) {
          router.replace(`/player/${storedCode}`);
          return;
        }
      } else {
        const newCode = generateDisplayCode();
        console.log('🆕 Generated new display code:', newCode);
        localStorage.setItem('sorafeed-display-code', newCode);
        setCode(newCode);
        
        if (urlCode !== newCode) {
          router.replace(`/player/${newCode}`);
          return;
        }
      }
      
      setCode(urlCode);
    };

    initializeCode();
  }, [urlCode, router]);

  // Initialize display and start polling
  useEffect(() => {
    if (!code) return;

    const initializeDisplay = async () => {
      try {
        const response = await fetch(`/api/displays/${code}`);
        if (response.ok) {
          const display = await response.json();
          setVMState(prev => ({
            ...prev,
            displayName: display.name
          }));
        } else if (response.status === 404) {
          console.log('🔍 Display not found in database yet, waiting for admin to add it');
        }
      } catch (error) {
        console.error('Failed to get display info:', error);
      }
    };

    initializeDisplay();

    // Start polling - faster interval for smoother video transitions
    pollIntervalRef.current = setInterval(pollServer, 1000);
    
    // Continuous preloading is now handled by the poll response
    // No need for a separate interval

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [code, pollServer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Error display
  if (vmState.error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-red-900">
        <div className="text-center text-white">
          <div className="text-2xl mb-4">Connection Error</div>
          <div className="text-lg opacity-70">{vmState.error}</div>
          <div className="text-sm mt-4">Code: {code}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-hidden">
      {vmState.currentVideo ? (
        <div className="relative w-full h-full">
          <TVVideoPlayer
            video={vmState.currentVideo}
            isPlaying={playbackState.isPlaying}
            isMuted={playbackState.isMuted}
            onVideoEnd={handleVideoEnd}
            onVideoReady={handleVideoReady}
            onAutoplayBlocked={handleAutoplayBlocked}
            onVideoClick={handleVideoClick}
            onMuteToggle={handleMuteToggle}
          />
        </div>
      ) : vmState.isConnected ? (
        // Show black screen while waiting for next video (seamless transition)
        <div className="w-full h-full bg-black flex items-center justify-center">
          <div className="text-white text-center opacity-50">
            <div className="text-lg">Loading next video...</div>
            <div className="text-sm mt-2">{vmState.displayName}</div>
          </div>
        </div>
      ) : (
        <CodeDisplay 
          code={code} 
          displayName={vmState.displayName}
        />
      )}
    </div>
  );
}