'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SoraFeedItem } from '@/types/sora';
import { TimelineVideo, DisplayCommand } from '@/types/timeline';
import SimpleVideoPlayer from '@/components/player/SimpleVideoPlayer';
import CodeDisplay from '@/components/player/CodeDisplay';
import ConnectedDisplay from '@/components/player/ConnectedDisplay';
import { useVMWebSocket } from '@/hooks/useVMWebSocket';

interface VMState {
  status: 'idle' | 'playing' | 'paused' | 'loading';
  currentVideo: SoraFeedItem | null;
  currentTimelineVideo: TimelineVideo | null;
  isPlaying: boolean;
  isMuted: boolean;
  position: number;
  displayName: string;
  error: string | null;
  isConnected: boolean;
  hasActivePlaylist: boolean; // Track if playlist is active
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
    status: 'idle',
    currentVideo: null,
    currentTimelineVideo: null,
    isPlaying: false,
    isMuted: false,
    position: 0,
    displayName: '',
    error: null,
    isConnected: false,
    hasActivePlaylist: false
  });
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [videoProgress, setVideoProgress] = useState({ currentTime: 0, duration: 0 });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoPreloadRef = useRef<HTMLVideoElement[]>([]);
  const codeInitialized = useRef(false);
  const autoInteractionTriggered = useRef(false);

  // Initialize WebSocket connection only when code is available
  const { isConnected: wsConnected, sendProgressUpdate, sendVideoChange } = useVMWebSocket(code || '');

  // Polling function
  const pollServer = useCallback(async () => {
    if (!code) return;
    
    try {
      const response = await fetch(`/api/poll/${code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: vmState.status,
          currentVideoId: vmState.currentTimelineVideo?.video_id,
          position: vmState.position
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
          error: null, // Clear any previous errors
          isConnected: false, // Not connected to the system
          currentVideo: null, // Clear any current video
          currentTimelineVideo: null, // Clear timeline
          status: 'idle', // Reset status
          displayName: '', // Clear display name
          hasActivePlaylist: false // Clear playlist state
        }));
        return;
      }

      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Successfully connected to the system!
      setVMState(prev => ({
        ...prev,
        error: null,
        isConnected: true,
        displayName: data.displayName || prev.displayName
      }));
      
      // Process commands
      if (data.commands && data.commands.length > 0) {
        processCommands(data.commands);
      }

          // Load next video if provided
          if (data.nextVideo && (!vmState.currentTimelineVideo || data.nextVideo.id !== vmState.currentTimelineVideo.id)) {
            console.log('🎬 Loading new video:', data.nextVideo.video_id);
            console.log('🎬 Video data:', data.nextVideo.video_data);
            
            const videoData = data.nextVideo.video_data;
            
            setVMState(prev => ({
              ...prev,
              currentVideo: videoData,
              currentTimelineVideo: data.nextVideo,
              status: 'playing',
              isPlaying: true, // Actually start playing the video
              hasActivePlaylist: true // Mark that we have an active playlist
            }));

            // Send video change to WebSocket
            if (wsConnected && videoData) {
              sendVideoChange({
                id: videoData.post?.id || data.nextVideo.video_id,
                username: videoData.profile?.username || 'Unknown',
                description: (videoData.post?.text || '').substring(0, 100) + ((videoData.post?.text || '').length > 100 ? '...' : ''),
                duration: 0, // We don't have duration info yet
                position: 0
              });
            }
          }

          // Send progress update if we have timeline data
          if (wsConnected && data.progress) {
            sendProgressUpdate({
              currentIndex: data.progress.overallProgress?.currentPosition || 0,
              totalVideos: data.progress.overallProgress?.totalInCurrentLoop || 0,
              playlistName: data.progress.currentBlock?.name || 'Unknown Playlist'
            });
          }

    } catch (error) {
      console.error('❌ Poll error:', error);
      // Only set error for non-404 errors
      if (!error.message?.includes('404')) {
        setVMState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Connection error'
        }));
      }
    }
  }, [code, vmState.status, vmState.currentTimelineVideo, vmState.position]);

  // Stop video progress tracking
  const stopVideoProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Handle video end
  const handleVideoEnd = useCallback(async () => {
    console.log('🎬 Video ended, marking as played');
    
    // Stop video progress tracking
    stopVideoProgressTracking();
    
    if (vmState.currentTimelineVideo) {
      // Mark video as played
      try {
        await fetch(`/api/timeline/mark-played`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timelineVideoId: vmState.currentTimelineVideo.id
          })
        });
      } catch (error) {
        console.error('Failed to mark video as played:', error);
      }
    }

    // Trigger scroll animation to next video - don't clear current video yet
    setVMState(prev => ({
      ...prev,
      status: 'idle', // This will trigger next video fetch in polling
      isPlaying: false,
      position: 0
      // Keep current video and timeline video for scroll animation
      // Keep hasActivePlaylist true so we don't show connected screen
    }));
  }, [vmState.currentTimelineVideo, stopVideoProgressTracking]);

  // Handle autoplay failure
  const handleAutoplayBlocked = useCallback(() => {
    console.log('🚫 Autoplay blocked, requiring user interaction');
    setNeedsUserInteraction(true);
  }, []);

  // Handle user interaction to start playback
  const handleUserInteraction = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('👆 User interaction detected, enabling autoplay');
    setNeedsUserInteraction(false);
    setVMState(prev => ({
      ...prev,
      isPlaying: true
    }));
    
    // Immediately try to play the video to establish user interaction
    const video = document.querySelector('video');
    if (video) {
      console.log('🎬 Attempting direct video play after user interaction');
      video.play().then(() => {
        console.log('✅ Video started playing successfully');
      }).catch(err => {
        console.error('❌ Direct video play failed:', err);
        // If it still fails, the video component will handle it
      });
    }
  }, []);

  // Process commands from admin
  const processCommands = useCallback((commands: DisplayCommand[]) => {
    commands.forEach(command => {
      console.log('📡 Processing command:', command.type);
      
      switch (command.type) {
        case 'play':
          setVMState(prev => ({ ...prev, isPlaying: true, status: 'playing' }));
          break;
        case 'pause':
          setVMState(prev => ({ ...prev, isPlaying: false, status: 'paused' }));
          break;
        case 'mute':
          setVMState(prev => ({ ...prev, isMuted: true }));
          break;
        case 'unmute':
          setVMState(prev => ({ ...prev, isMuted: false }));
          break;
        case 'next':
          console.log('⏭️ Next video command received');
          handleVideoEnd();
          break;
        case 'seek':
          if (command.payload?.position !== undefined) {
            setVMState(prev => ({ ...prev, position: command.payload!.position! }));
          }
          break;
        default:
          console.warn('Unknown command:', command.type);
      }
    });
  }, [handleVideoEnd]);

  // Handle video ready
  const handleVideoReady = useCallback(() => {
    console.log('✅ Video ready, attempting to start playback');

    // Don't auto-start if user interaction is needed
    if (needsUserInteraction) {
      console.log('⏸️ User interaction required, waiting for click');
      return;
    }

    setVMState(prev => ({
      ...prev,
      status: 'playing',
      isPlaying: true,
      error: null
    }));

    // Start tracking video progress for smooth updates
    startVideoProgressTracking();
  }, [needsUserInteraction, startVideoProgressTracking]);

  // Track video progress for smooth progress updates
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
          
          // Send enhanced progress update with video-level progress
          if (wsConnected && vmState.currentTimelineVideo) {
            const videoProgressPercent = (currentTime / duration) * 100;
            
            // Calculate overall progress including current video progress
            const baseProgress = vmState.currentTimelineVideo.timeline_position;
            const videoFraction = videoProgressPercent / 100;
            const enhancedPosition = baseProgress + videoFraction;
            
            sendProgressUpdate({
              currentIndex: Math.floor(enhancedPosition),
              totalVideos: vmState.currentTimelineVideo.timeline_position + 10, // Approximate total
              playlistName: 'Current Playlist',
              videoProgress: videoProgressPercent,
              enhancedPosition: enhancedPosition
            });
          }
        }
      }
    }, 1000); // Update every second
  }, [wsConnected, vmState.currentTimelineVideo, sendProgressUpdate]);

  // Initialize code and display
  useEffect(() => {
    if (codeInitialized.current) return;
    codeInitialized.current = true;

    const initializeCode = () => {
      // Check if we have a stored code in localStorage
      const storedCode = localStorage.getItem('sorafeed-display-code');
      
      if (storedCode) {
        // Use existing code from localStorage
        console.log('🔑 Using stored display code:', storedCode);
        setCode(storedCode);
        
        // If URL code doesn't match stored code, redirect to correct URL
        if (urlCode !== storedCode) {
          router.replace(`/player/${storedCode}`);
          return;
        }
      } else {
        // Generate new code and store it
        const newCode = generateDisplayCode();
        console.log('🆕 Generated new display code:', newCode);
        localStorage.setItem('sorafeed-display-code', newCode);
        setCode(newCode);
        
        // If URL code doesn't match new code, redirect to correct URL
        if (urlCode !== newCode) {
          router.replace(`/player/${newCode}`);
          return;
        }
      }
      
      // If we're here, the URL code matches our code
      setCode(urlCode);
    };

    initializeCode();
  }, [urlCode, router]);

  // Initialize display and start polling (only when code is set)
  useEffect(() => {
    if (!code) return;

    const initializeDisplay = async () => {
      try {
        // Try to get existing display info
        const response = await fetch(`/api/displays/${code}`);
        if (response.ok) {
          const display = await response.json();
          setVMState(prev => ({
            ...prev,
            displayName: display.name
          }));
        } else if (response.status === 404) {
          // Display doesn't exist yet, that's fine
          console.log('🔍 Display not found in database yet, waiting for admin to add it');
        }
      } catch (error) {
        console.error('Failed to get display info:', error);
      }
    };

    initializeDisplay();

        // Start polling - faster interval for smoother video transitions
        pollIntervalRef.current = setInterval(pollServer, 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [code, pollServer]);

  // Auto-interaction for kiosk mode - triggers when first video loads
  useEffect(() => {
    if (vmState.currentVideo && !autoInteractionTriggered.current) {
      autoInteractionTriggered.current = true;
      
      // Small delay to ensure video element is ready
      setTimeout(() => {
        console.log('🤖 Triggering auto-interaction for kiosk mode');
        
        // Simulate multiple interaction types to ensure autoplay is enabled
        const interactionEvents = ['click', 'touchstart', 'keydown'];
        
        interactionEvents.forEach(eventType => {
          const event = new Event(eventType, { bubbles: true });
          document.body.dispatchEvent(event);
        });
        
        // Also try direct video interaction
        const videoElement = document.querySelector('video');
        if (videoElement) {
          const clickEvent = new MouseEvent('click', { bubbles: true });
          videoElement.dispatchEvent(clickEvent);
        }
        
        console.log('🤖 Auto-interaction events dispatched');
      }, 100);
    }
  }, [vmState.currentVideo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
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
          <SimpleVideoPlayer
            video={vmState.currentVideo}
            isPlaying={vmState.isPlaying}
            isMuted={vmState.isMuted}
            onVideoEnd={handleVideoEnd}
            onVideoReady={handleVideoReady}
            onAutoplayBlocked={handleAutoplayBlocked}
          />
          {needsUserInteraction && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
              <button
                onClick={handleUserInteraction}
                className="text-center text-white bg-transparent border-none cursor-pointer focus:outline-none"
              >
                <div className="w-20 h-20 mx-auto mb-4 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <div className="w-0 h-0 border-l-8 border-l-white border-t-6 border-t-transparent border-b-6 border-b-transparent ml-1"></div>
                </div>
                <div className="text-xl font-semibold mb-2">Click to Play</div>
                <div className="text-sm opacity-75">Browser requires interaction to start video</div>
              </button>
            </div>
          )}
        </div>
      ) : vmState.isConnected ? (
        <ConnectedDisplay 
          code={code} 
          displayName={vmState.displayName}
        />
      ) : (
        <CodeDisplay 
          code={code} 
          displayName={vmState.displayName}
        />
      )}
    </div>
  );
}
