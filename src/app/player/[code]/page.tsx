'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SoraFeedItem } from '@/types/sora';
import { TimelineVideo, DisplayCommand } from '@/types/timeline';
import SimpleVideoPlayer from '@/components/player/SimpleVideoPlayer';
import CodeDisplay from '@/components/player/CodeDisplay';

interface VMState {
  status: 'idle' | 'playing' | 'paused' | 'loading';
  currentVideo: SoraFeedItem | null;
  currentTimelineVideo: TimelineVideo | null;
  isPlaying: boolean;
  isMuted: boolean;
  position: number;
  displayName: string;
  error: string | null;
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
    error: null
  });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoPreloadRef = useRef<HTMLVideoElement[]>([]);
  const codeInitialized = useRef(false);

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
        // Display not found - this is normal until admin adds it
        console.log('🔍 Display not found in system yet, waiting for admin to add it');
        setVMState(prev => ({
          ...prev,
          error: null // Clear any previous errors
        }));
        return;
      }

      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Clear any previous errors since polling is working
      setVMState(prev => ({
        ...prev,
        error: null
      }));
      
      // Process commands
      if (data.commands && data.commands.length > 0) {
        processCommands(data.commands);
      }

      // Load next video if provided
      if (data.nextVideo && (!vmState.currentTimelineVideo || data.nextVideo.id !== vmState.currentTimelineVideo.id)) {
        console.log('🎬 Loading new video:', data.nextVideo.video_id);
        setVMState(prev => ({
          ...prev,
          currentVideo: data.nextVideo.video_data,
          currentTimelineVideo: data.nextVideo,
          status: 'loading'
        }));
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
  }, []);

  // Handle video end
  const handleVideoEnd = useCallback(async () => {
    console.log('🎬 Video ended, marking as played');
    
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

    // Reset state and wait for next video
    setVMState(prev => ({
      ...prev,
      status: 'idle',
      currentVideo: null,
      currentTimelineVideo: null,
      isPlaying: false,
      position: 0
    }));
  }, [vmState.currentTimelineVideo]);

  // Handle video ready
  const handleVideoReady = useCallback(() => {
    console.log('✅ Video ready, starting playback');
    setVMState(prev => ({
      ...prev,
      status: 'playing',
      isPlaying: true,
      error: null
    }));
  }, []);

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

    // Start polling
    pollIntervalRef.current = setInterval(pollServer, 2500);

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
        <SimpleVideoPlayer
          video={vmState.currentVideo}
          isPlaying={vmState.isPlaying}
          isMuted={vmState.isMuted}
          onVideoEnd={handleVideoEnd}
          onVideoReady={handleVideoReady}
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
