'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { SoraFeedItem } from '@/types/sora';

interface TVVideoPlayerProps {
  video: SoraFeedItem | null;
  isPlaying: boolean;
  isMuted: boolean;
  onVideoEnd: () => void;
  onVideoReady: () => void;
  onAutoplayBlocked?: () => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export default function TVVideoPlayer({ 
  video, 
  isPlaying, 
  isMuted, 
  onVideoEnd, 
  onVideoReady,
  onAutoplayBlocked,
  onPlayStateChange
}: TVVideoPlayerProps) {
  // State from social VideoFeed
  const [videos, setVideos] = useState<SoraFeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);

  // Check if user has interacted in this session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasInteracted = sessionStorage.getItem('sorafeed-user-interacted') === 'true';
      if (hasInteracted) {
        console.log('✅ User has already interacted in this session');
        setUserHasInteracted(true);
      }
    }
  }, []);

  // Video management - exactly like social branch
  useEffect(() => {
    if (!video) {
      setVideos([]);
      setCurrentIndex(0);
      return;
    }

    // Check if this video is already in our list
    const existingIndex = videos.findIndex(v => v.post.id === video.post.id);
    
    if (existingIndex !== -1) {
      // Video already exists, just switch to it if needed
      if (existingIndex !== currentIndex) {
        goToVideo(existingIndex);
      }
      return;
    }

    // New video - add it to the list and transition to it
    const newVideos = [...videos, video];
    setVideos(newVideos);
    
    if (videos.length === 0) {
      // First video - no animation needed
      setCurrentIndex(0);
      onVideoReady();
    } else {
      // Transition to new video
      goToVideo(newVideos.length - 1);
    }
  }, [video]);

  // Navigation functions from social VideoFeed
  const goToNext = useCallback((animated = true) => {
    if (currentIndex < videos.length - 1) {
      if (animated) {
        setIsScrolling(true);
        // Animate to next position then change index
        animate(y, -window.innerHeight, {
          type: 'spring',
          stiffness: 400,
          damping: 40,
          onComplete: () => {
            setCurrentIndex(currentIndex + 1);
            y.set(0); // Reset position after animation
            setIsScrolling(false);
          }
        });
      } else {
        // Immediate change
        setCurrentIndex(currentIndex + 1);
        y.set(0);
      }
    }
  }, [currentIndex, videos.length, y]);

  const goToPrevious = useCallback((animated = true) => {
    if (currentIndex > 0) {
      if (animated) {
        setIsScrolling(true);
        // Animate to previous position then change index
        animate(y, window.innerHeight, {
          type: 'spring',
          stiffness: 400,
          damping: 40,
          onComplete: () => {
            setCurrentIndex(currentIndex - 1);
            y.set(0); // Reset position after animation
            setIsScrolling(false);
          }
        });
      } else {
        // Immediate change
        setCurrentIndex(currentIndex - 1);
        y.set(0);
      }
    }
  }, [currentIndex, y]);

  const goToVideo = useCallback((targetIndex: number) => {
    if (targetIndex === currentIndex || targetIndex < 0 || targetIndex >= videos.length) {
      return;
    }

    setIsScrolling(true);
    const direction = targetIndex > currentIndex ? -1 : 1;
    const distance = direction * window.innerHeight;
    
    animate(y, distance, {
      type: 'spring',
      stiffness: 400,
      damping: 40,
      onComplete: () => {
        setCurrentIndex(targetIndex);
        y.set(0);
        setIsScrolling(false);
        onVideoReady();
      }
    });
  }, [currentIndex, videos.length, y, onVideoReady]);

  // Drag gesture from social VideoFeed
  const bind = useDrag(
    ({ last, movement: [, my], direction: [, dy], velocity: [, vy], cancel }) => {
      if (videos.length <= 1) return;

      if (isScrolling) {
        cancel?.();
        return;
      }

      // Update y position during drag
      if (!last) {
        y.set(my);
        return;
      }

      // On release, determine if we should snap to next/previous video
      const threshold = window.innerHeight * 0.25; // 25% of screen height
      const velocityThreshold = 0.5;

      if (Math.abs(my) > threshold || Math.abs(vy) > velocityThreshold) {
        if (dy > 0 && currentIndex > 0) {
          // Scrolling up - go to previous video
          goToPrevious();
        } else if (dy < 0 && currentIndex < videos.length - 1) {
          // Scrolling down - go to next video
          goToNext();
        } else {
          // Snap back to current video
          animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
        }
      } else {
        // Snap back to current video
        animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      rubberband: true,
    }
  );

  // Keyboard navigation from social VideoFeed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isScrolling) return;
      
      // Don't trigger navigation if user is typing
      const activeElement = document.activeElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).isContentEditable
      );
      
      if (isTyping) return;
      
      if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, isScrolling]);

  // Handle user interaction
  const handleUserInteraction = useCallback(() => {
    console.log('👆 User interaction detected, enabling auto-play');
    setUserHasInteracted(true);
    
    // Store in sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('sorafeed-user-interacted', 'true');
    }

    // Update play state
    onPlayStateChange?.(true);
  }, [onPlayStateChange]);

  // Single Video Component - simplified from social VideoPost
  const VideoComponent = ({ videoData, index }: { videoData: SoraFeedItem; index: number }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const playingRef = useRef(false); // Track if we're currently trying to play
    const isActive = index === currentIndex;
    const offset = index - currentIndex;

    const videoUrl = videoData.post.attachments?.[0]?.encodings?.md?.path || 
                     videoData.post.attachments?.[0]?.encodings?.source?.path;

    if (!videoUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <div className="text-white text-xl">Video URL not available</div>
        </div>
      );
    }

    // Video control effect - simplified to prevent loops
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !isActive || !videoLoaded) return;

      // Only control video if user has interacted
      if (userHasInteracted) {
        if (isPlaying && video.paused && !playingRef.current) {
          console.log('▶️ Starting video playback:', videoData.post.id.slice(-6));
          playingRef.current = true;
          video.play().then(() => {
            playingRef.current = false;
          }).catch(err => {
            console.error('❌ Failed to play video:', err);
            playingRef.current = false;
            onAutoplayBlocked?.();
          });
        } else if (!isPlaying && !video.paused) {
          console.log('⏸️ Pausing video:', videoData.post.id.slice(-6));
          video.pause();
        }
      } else if (!userHasInteracted && video.paused) {
        // Video is ready but waiting for user interaction
        onAutoplayBlocked?.();
      }
    }, [isActive, isPlaying, userHasInteracted, videoLoaded]);

    // Mute control
    useEffect(() => {
      const video = videoRef.current;
      if (video) {
        video.muted = isMuted;
      }
    }, [isMuted]);

    const handleVideoClick = () => {
      if (!isActive || !videoLoaded) return;
      
      const video = videoRef.current;
      if (!video) return;
      
      console.log('🎬 Video clicked:', {
        videoId: videoData.post.id.slice(-6),
        userHasInteracted,
        isPlaying,
        videoPaused: video.paused,
        playingRef: playingRef.current
      });
      
      if (!userHasInteracted) {
        // First interaction
        handleUserInteraction();
      } else if (!playingRef.current) {
        // Toggle play/pause only if we're not already trying to play
        if (video.paused) {
          console.log('👆 Manual play request');
          playingRef.current = true;
          video.play().then(() => {
            playingRef.current = false;
          }).catch(err => {
            console.error('❌ Failed to play video manually:', err);
            playingRef.current = false;
          });
        } else {
          console.log('👆 Manual pause request');
          video.pause();
        }
      }
    };

    return (
      <div 
        className="absolute inset-0 w-full h-full cursor-pointer"
        style={{ 
          transform: `translateY(${offset * 100}%)`,
          zIndex: isActive ? 20 : 10
        }}
        onClick={handleVideoClick}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          src={videoUrl}
          loop={false}
          playsInline
          preload="auto"
          muted={isMuted}
          onLoadedData={() => {
            console.log('✅ Video loaded:', videoData.post.id.slice(-6));
            setVideoLoaded(true);
          }}
          onEnded={() => {
            if (isActive) {
              console.log('🎬 Video ended:', videoData.post.id);
              onVideoEnd();
            }
          }}
          onPlay={() => {
            if (isActive && !playingRef.current) {
              console.log('▶️ Video play event');
              onPlayStateChange?.(true);
            }
          }}
          onPause={() => {
            if (isActive && !playingRef.current) {
              console.log('⏸️ Video pause event');
              onPlayStateChange?.(false);
            }
          }}
          onError={() => {
            console.error('❌ Video error:', videoData.post.id);
          }}
        />

        {/* Click to play overlay */}
        {isActive && (!userHasInteracted || !isPlaying) && videoLoaded && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-30">
            <div className="text-center text-white">
              <div className="w-20 h-20 mx-auto mb-4 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <div className="w-0 h-0 border-l-8 border-l-white border-t-6 border-t-transparent border-b-6 border-b-transparent ml-1"></div>
              </div>
              <div className="text-xl font-semibold">Click to Play</div>
            </div>
          </div>
        )}

        {/* Video info overlay */}
        <div className="absolute bottom-4 left-4 right-4 text-white pointer-events-none">
          <div className="text-sm opacity-70 bg-black bg-opacity-50 p-2 rounded">
            @{videoData.profile.username} • {videoData.post.text?.slice(0, 100)}
          </div>
        </div>
      </div>
    );
  };

  if (videos.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-white text-xl">No video loaded</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-dvh bg-black"
      style={{ overflow: 'hidden', touchAction: 'none' }}
      tabIndex={0}
    >
      {/* Clipping container to prevent videos from showing outside viewport */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Draggable container with all videos - exact same as social */}
        <motion.div 
          {...(bind() as any)}
          style={{ y, touchAction: 'none' }}
          className="absolute inset-0"
        >
          {/* Render videos with scroll-aware playback */}
          {videos.map((videoData, index) => {
            const offset = index - currentIndex;
            // Keep videos mounted within ±1 positions for smooth scrolling
            const shouldRender = Math.abs(offset) <= 1;
            
            if (!shouldRender) return null;
            
            return (
              <VideoComponent 
                key={videoData.post.id}
                videoData={videoData} 
                index={index}
              />
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
