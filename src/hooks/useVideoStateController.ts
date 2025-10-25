import { useCallback, useRef, useState } from 'react';

export interface VideoState {
  isPlaying: boolean;
  isMuted: boolean;
  status: 'idle' | 'playing' | 'paused' | 'loading';
  position: number;
}

export interface VideoStateController {
  state: VideoState;
  // Core control methods
  play: () => void;
  pause: () => void;
  mute: () => void;
  unmute: () => void;
  seek: (position: number) => void;
  
  // Internal methods for video element events
  handleVideoPlay: () => void;
  handleVideoPause: () => void;
  handleVideoReady: () => void;
  
  // Admin command processing
  processCommand: (command: { type: string; payload?: any }) => void;
  
  // User interaction
  handleUserInteraction: () => void;
}

export function useVideoStateController(
  initialState: Partial<VideoState> = {},
  onStateChange?: (state: VideoState) => void
): VideoStateController {
  
  const [state, setState] = useState<VideoState>({
    isPlaying: true, // Start playing by default
    isMuted: true, // Start muted by default
    status: 'playing',
    position: 0,
    ...initialState
  });

  // Track the actual video element state to prevent loops
  const videoElementStateRef = useRef<{
    isPlaying: boolean;
    lastReportedState: boolean | null;
  }>({
    isPlaying: false,
    lastReportedState: null
  });

  // Prevent rapid state changes
  const lastStateChangeRef = useRef<number>(0);
  const STATE_CHANGE_DEBOUNCE = 100; // 100ms debounce

  // Centralized state update function
  const updateState = useCallback((updates: Partial<VideoState>, source: string) => {
    const now = Date.now();
    
    setState(prevState => {
      // Check if any values actually changed
      const hasChanges = Object.keys(updates).some(key => {
        const typedKey = key as keyof VideoState;
        return prevState[typedKey] !== updates[typedKey];
      });

      if (!hasChanges) {
        console.log(`🎮 [${source}] No state changes needed`);
        return prevState;
      }

      // Debounce rapid changes
      if (now - lastStateChangeRef.current < STATE_CHANGE_DEBOUNCE) {
        console.log(`🎮 [${source}] Debouncing rapid state change`);
        return prevState;
      }

      lastStateChangeRef.current = now;
      
      const newState = { ...prevState, ...updates };
      console.log(`🎮 [${source}] State update:`, {
        from: prevState,
        to: newState,
        changes: updates
      });

      // Notify external listeners
      onStateChange?.(newState);
      
      return newState;
    });
  }, [onStateChange]);

  // Core control methods
  const play = useCallback(() => {
    updateState({ isPlaying: true, status: 'playing' }, 'PLAY_COMMAND');
  }, [updateState]);

  const pause = useCallback(() => {
    updateState({ isPlaying: false, status: 'paused' }, 'PAUSE_COMMAND');
  }, [updateState]);

  const mute = useCallback(() => {
    updateState({ isMuted: true }, 'MUTE_COMMAND');
  }, [updateState]);

  const unmute = useCallback(() => {
    updateState({ isMuted: false }, 'UNMUTE_COMMAND');
  }, [updateState]);

  const seek = useCallback((position: number) => {
    updateState({ position }, 'SEEK_COMMAND');
  }, [updateState]);

  // Video element event handlers
  const handleVideoPlay = useCallback(() => {
    videoElementStateRef.current.isPlaying = true;
    
    // Only update state if we haven't already reported this
    if (videoElementStateRef.current.lastReportedState !== true) {
      console.log('📹 Video element started playing');
      videoElementStateRef.current.lastReportedState = true;
      updateState({ isPlaying: true, status: 'playing' }, 'VIDEO_PLAY_EVENT');
    } else {
      console.log('📹 Ignoring duplicate video play event');
    }
  }, [updateState]);

  const handleVideoPause = useCallback(() => {
    videoElementStateRef.current.isPlaying = false;
    
    // Only update state if we haven't already reported this
    if (videoElementStateRef.current.lastReportedState !== false) {
      console.log('📹 Video element paused');
      videoElementStateRef.current.lastReportedState = false;
      updateState({ isPlaying: false, status: 'paused' }, 'VIDEO_PAUSE_EVENT');
    } else {
      console.log('📹 Ignoring duplicate video pause event');
    }
  }, [updateState]);

  const handleVideoReady = useCallback(() => {
    console.log('📹 Video ready');
    updateState({ status: 'idle' }, 'VIDEO_READY');
  }, [updateState]);

  // Admin command processing
  const processCommand = useCallback((command: { type: string; payload?: any }) => {
    console.log('📡 Processing admin command:', command.type);
    
    switch (command.type) {
      case 'play':
        if (state.isPlaying && state.status === 'playing') {
          console.log('📡 Ignoring play command - already playing');
          return;
        }
        play();
        break;
        
      case 'pause':
        if (!state.isPlaying && state.status === 'paused') {
          console.log('📡 Ignoring pause command - already paused');
          return;
        }
        pause();
        break;
        
      case 'mute':
        if (state.isMuted) {
          console.log('📡 Ignoring mute command - already muted');
          return;
        }
        mute();
        break;
        
      case 'unmute':
        if (!state.isMuted) {
          console.log('📡 Ignoring unmute command - already unmuted');
          return;
        }
        unmute();
        break;
        
      case 'seek':
        if (command.payload?.position !== undefined) {
          seek(command.payload.position);
        }
        break;
        
      default:
        console.warn('📡 Unknown command type:', command.type);
    }
  }, [state, play, pause, mute, unmute, seek]);

  // User interaction handler
  const handleUserInteraction = useCallback(() => {
    console.log('👆 User interaction - starting playback');
    updateState({ 
      isPlaying: true, 
      isMuted: false, // Unmute on user interaction
      status: 'playing' 
    }, 'USER_INTERACTION');
  }, [updateState]);

  // Reset video element state tracking when video changes
  const resetVideoElementState = useCallback(() => {
    videoElementStateRef.current = {
      isPlaying: false,
      lastReportedState: null
    };
  }, []);

  return {
    state,
    play,
    pause,
    mute,
    unmute,
    seek,
    handleVideoPlay,
    handleVideoPause,
    handleVideoReady,
    processCommand,
    handleUserInteraction,
    // Expose reset function for when video changes
    resetVideoElementState
  } as VideoStateController & { resetVideoElementState: () => void };
}

