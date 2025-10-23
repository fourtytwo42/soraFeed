'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
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

export default function VMPlayer() {
  const params = useParams();
  const code = params.code as string;
  
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

  // Polling function
  const pollServer = useCallback(async () => {
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

      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }

      const data = await response.json();
      
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
      setVMState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Connection error'
      }));
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

  // Initialize display and start polling
  useEffect(() => {
    const initializeDisplay = async () => {
      try {
        // Get display info
        const response = await fetch(`/api/displays/${code}`);
        if (response.ok) {
          const display = await response.json();
          setVMState(prev => ({
            ...prev,
            displayName: display.name
          }));
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
