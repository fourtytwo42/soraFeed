'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { SoraFeedItem } from '@/types/sora';

interface ScrollingVideoPlayerProps {
  video: SoraFeedItem | null;
  isPlaying: boolean;
  isMuted: boolean;
  onVideoEnd: () => void;
  onVideoReady: () => void;
  onAutoplayBlocked?: () => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export default function ScrollingVideoPlayer({ 
  video, 
  isPlaying, 
  isMuted, 
  onVideoEnd, 
  onVideoReady,
  onAutoplayBlocked,
  onPlayStateChange
}: ScrollingVideoPlayerProps) {
  const [videos, setVideos] = useState<SoraFeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [screenHeight, setScreenHeight] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const y = useMotionValue(0);

  // Get screen height on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setScreenHeight(window.innerHeight);
      
      const handleResize = () => setScreenHeight(window.innerHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

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

  // Video management - add new videos and handle transitions
  useEffect(() => {
    console.log('🎬 Video management effect triggered:', {
      hasVideo: !!video,
      videoId: video?.post.id.slice(-6),
      videosCount: videos.length,
      currentIndex
    });

    if (!video) {
      setVideos([]);
      setCurrentIndex(0);
      return;
    }

    // Check if this video is already in our list
    const existingIndex = videos.findIndex(v => v.post.id === video.post.id);
    
    if (existingIndex !== -1) {
      console.log('🎬 Video already exists at index:', existingIndex);
      // Video already exists, just switch to it if needed
      if (existingIndex !== currentIndex) {
        console.log('🎬 Switching to existing video');
        goToVideo(existingIndex);
      }
      return;
    }

    // New video - add it to the list and transition to it
    console.log('🎬 Adding new video to list');
    const newVideos = [...videos, video];
    setVideos(newVideos);
    
    if (videos.length === 0) {
      // First video - no animation needed
      console.log('🎬 First video, no animation');
      setCurrentIndex(0);
      onVideoReady();
    } else {
      // Transition to new video
      console.log('🎬 Transitioning to new video');
      goToVideo(newVideos.length - 1);
    }
  }, [video]);

  // Function to transition to a specific video index with smooth scrolling
  const goToVideo = useCallback((targetIndex: number) => {
    if (targetIndex === currentIndex || targetIndex < 0 || targetIndex >= videos.length) {
      return;
    }

    setIsScrolling(true);

    // Calculate the distance to move
    const distance = (targetIndex - currentIndex) * screenHeight;
    
    animate(y, -distance, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
      duration: 0.8,
      onComplete: () => {
        console.log('🎬 Transition complete to video', targetIndex);
        setCurrentIndex(targetIndex);
        y.set(0);
        setIsScrolling(false);
        onVideoReady();
      }
    });
  }, [currentIndex, videos.length, screenHeight, y, onVideoReady]);

  // Drag gesture for manual scrolling
  const bind = useDrag(
    ({ last, movement: [, my], direction: [, dy], velocity: [, vy], cancel }) => {
      if (videos.length <= 1) return;

      // Update y position during drag
      if (!last) {
        y.set(my);
        return;
      }

      // On release, determine if we should snap to next/previous video
      const threshold = screenHeight * 0.2; // 20% of screen height
      const velocityThreshold = 0.5;

      if (Math.abs(my) > threshold || Math.abs(vy) > velocityThreshold) {
        if (dy > 0 && currentIndex > 0) {
          // Scrolling up - go to previous video
          goToVideo(currentIndex - 1);
        } else if (dy < 0 && currentIndex < videos.length - 1) {
          // Scrolling down - go to next video
          goToVideo(currentIndex + 1);
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

  // Video control - only play if user has interacted
  useEffect(() => {
    if (videos.length === 0 || currentIndex >= videos.length) return;

    const currentVideo = videos[currentIndex];
    const videoElement = videoRefs.current.get(currentVideo.post.id);
    
    if (!videoElement) {
      console.log('⏸️ No video element found for current video:', currentVideo.post.id.slice(-6));
      return;
    }

    console.log('🎮 Video control effect:', {
      videoId: currentVideo.post.id.slice(-6),
      isPlaying,
      userHasInteracted,
      videoPaused: videoElement.paused
    });

    // Only auto-play if user has interacted before
    if (isPlaying && userHasInteracted) {
      console.log('🎬 Playing video (user has interacted)');
      videoElement.play().catch(err => {
        console.error('❌ Failed to play video:', err);
      });
    } else if (!isPlaying) {
      console.log('⏸️ Pausing video');
      videoElement.pause();
    } else {
      console.log('⏸️ Video ready but waiting for user interaction');
      // Video is loaded but waiting for user to click play
      onAutoplayBlocked?.();
    }
  }, [isPlaying, videos, currentIndex, userHasInteracted, onAutoplayBlocked]);

  // Mute control effect
  useEffect(() => {
    if (videos.length === 0 || currentIndex >= videos.length) return;

    const currentVideo = videos[currentIndex];
    const videoElement = videoRefs.current.get(currentVideo.post.id);
    
    if (videoElement) {
      videoElement.muted = isMuted;
    }
  }, [isMuted, videos, currentIndex]);

  // Handle user interaction - this enables auto-play for future videos
  const handleUserInteraction = useCallback(() => {
    console.log('👆 User interaction detected, enabling auto-play');
    setUserHasInteracted(true);
    
    // Store in sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('sorafeed-user-interacted', 'true');
    }

    // Play current video
    if (videos.length > 0 && currentIndex < videos.length) {
      const currentVideo = videos[currentIndex];
      const videoElement = videoRefs.current.get(currentVideo.post.id);
      if (videoElement) {
        videoElement.play().catch(err => {
          console.error('❌ Failed to play video after interaction:', err);
        });
      }
    }
  }, [videos, currentIndex]);

  // Component to render a single video
  const VideoComponent = ({ videoData, index }: { videoData: SoraFeedItem; index: number }) => {
    const videoUrl = videoData.post.attachments?.[0]?.encodings?.md?.path || 
                     videoData.post.attachments?.[0]?.encodings?.source?.path;
    const isActive = index === currentIndex;
    const offset = index - currentIndex;

    console.log(`🎥 VideoComponent render - videoId: ${videoData.post.id.slice(-6)}, index: ${index}, isActive: ${isActive}, offset: ${offset}`);

    if (!videoUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <div className="text-white text-xl">Video URL not available</div>
        </div>
      );
    }

    const handleVideoEnd = () => {
      if (isActive) {
        console.log('🎬 Video ended:', videoData.post.id);
        onVideoEnd();
      }
    };

    const handleVideoError = () => {
      if (isActive) {
        console.error('❌ Video error:', videoData.post.id);
      }
    };

    const handleVideoLoaded = () => {
      if (isActive) {
        console.log('✅ Video loaded:', videoData.post.id);
      }
    };

    const handleVideoClick = () => {
      if (!isActive) return;
      
      const videoElement = videoRefs.current.get(videoData.post.id);
      if (!videoElement) return;
      
      console.log('🎬 Video clicked:', {
        videoId: videoData.post.id.slice(-6),
        userHasInteracted,
        isPlaying,
        videoPaused: videoElement.paused
      });
      
      if (!userHasInteracted) {
        // First interaction - enable auto-play for future videos
        handleUserInteraction();
      } else {
        // Toggle play/pause
        if (videoElement.paused) {
          videoElement.play().catch(err => {
            console.error('❌ Failed to play video:', err);
          });
        } else {
          videoElement.pause();
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
          ref={(el) => {
            if (el) {
              videoRefs.current.set(videoData.post.id, el);
            } else {
              videoRefs.current.delete(videoData.post.id);
            }
          }}
          className="w-full h-full object-cover"
          src={videoUrl}
          loop={false}
          playsInline
          preload="auto"
          muted={isMuted}
          onEnded={handleVideoEnd}
          onError={handleVideoError}
          onLoadedData={handleVideoLoaded}
          onCanPlayThrough={handleVideoLoaded}
          onPlay={() => {
            if (isActive) {
              console.log('▶️ Video play event');
              onPlayStateChange?.(true);
            }
          }}
          onPause={() => {
            if (isActive) {
              console.log('⏸️ Video pause event');
              onPlayStateChange?.(false);
            }
          }}
        />

        {/* Click to play overlay - show when video is paused and user needs to interact */}
        {isActive && (!userHasInteracted || !isPlaying) && (
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
      className="relative w-full h-full bg-black overflow-hidden"
      style={{ touchAction: 'none' }} // Fix @use-gesture warning
      tabIndex={0}
    >
      {/* Clipping container to prevent videos from showing outside viewport */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Draggable container with all videos */}
        <motion.div 
          {...(bind() as any)}
          style={{ y }}
          className="absolute inset-0"
        >
          {/* Render videos with offset positioning */}
          {videos.map((videoData, index) => {
            const offset = index - currentIndex;
            // Only render videos within ±1 positions for performance
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
