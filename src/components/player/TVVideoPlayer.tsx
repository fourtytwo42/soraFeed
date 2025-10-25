'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { SoraFeedItem } from '@/types/sora';
import SingleVideoPlayer from './SingleVideoPlayer';

interface TVVideoPlayerProps {
  video: SoraFeedItem | null;
  isPlaying: boolean;
  isMuted: boolean;
  onVideoEnd: () => void;
  onVideoReady: () => void;
  onAutoplayBlocked?: () => void;
  onVideoClick?: () => void;
  onMuteToggle?: () => void;
}

export default function TVVideoPlayer({ 
  video, 
  isPlaying, 
  isMuted, 
  onVideoEnd, 
  onVideoReady,
  onAutoplayBlocked,
  onVideoClick,
  onMuteToggle
}: TVVideoPlayerProps) {
  // State from social VideoFeed
  const [videos, setVideos] = useState<SoraFeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);

  // Check if user has interacted in this session - on mount and when video changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasInteracted = sessionStorage.getItem('sorafeed-user-interacted') === 'true';
      if (hasInteracted && !userHasInteracted) {
        console.log('✅ User has already interacted in this session, enabling autoplay');
        setUserHasInteracted(true);
      }
    }
  }, [userHasInteracted]); // Re-check if state somehow gets reset

  // Video management - simple replacement for playlist mode
  useEffect(() => {
    if (!video) {
      if (videos.length > 0) {
        console.log('🎬 Video cleared, resetting videos list');
        setVideos([]);
        setCurrentIndex(0);
      }
      return;
    }

    // Check if this is the same video
    if (videos.length > 0 && videos[0].post.id === video.post.id) {
      console.log('🎬 Same video, no reload needed');
      return;
    }

    // Replace with new video (playlist mode - no accumulation)
    console.log('🎬 Loading new video:', video.post.id.slice(-6));
    setVideos([video]);  // Replace entire list with just this video
    setCurrentIndex(0);
    onVideoReady();
  }, [video?.post.id, onVideoReady]); // Only depend on video ID, not the whole video object

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

    // User has interacted - video can now autoplay
    console.log('👆 User interaction detected');
  }, []);

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
              <SingleVideoPlayer
                key={videoData.post.id}
                videoData={videoData}
                index={index}
                currentIndex={currentIndex}
                isPlaying={isPlaying}
                isMuted={isMuted}
                userHasInteracted={userHasInteracted}
                onVideoEnd={onVideoEnd}
                onAutoplayBlocked={onAutoplayBlocked}
                onVideoClick={onVideoClick}
                onUserInteraction={handleUserInteraction}
                onMuteToggle={onMuteToggle}
              />
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
