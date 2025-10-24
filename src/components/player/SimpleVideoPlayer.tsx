'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { SoraFeedItem } from '@/types/sora';

interface SimpleVideoPlayerProps {
  video: SoraFeedItem | null;
  isPlaying: boolean;
  isMuted: boolean;
  onVideoEnd: () => void;
  onVideoReady: () => void;
  onAutoplayBlocked?: () => void;
}

export default function SimpleVideoPlayer({ 
  video, 
  isPlaying, 
  isMuted, 
  onVideoEnd, 
  onVideoReady,
  onAutoplayBlocked
}: SimpleVideoPlayerProps) {
  const [videos, setVideos] = useState<SoraFeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenHeight, setScreenHeight] = useState(0);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const y = useMotionValue(0);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Get screen height on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setScreenHeight(window.innerHeight);
      
      const handleResize = () => setScreenHeight(window.innerHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
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
      setIsLoading(true);
      setError(null);
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
      setIsLoading(false);
      setError(null);
      onVideoReady();
    } else {
      // Transition to new video
      console.log('🎬 Transitioning to new video');
      goToVideo(newVideos.length - 1);
    }
  }, [video]);

  // Function to transition to a specific video index
  const goToVideo = (targetIndex: number) => {
    if (targetIndex === currentIndex || targetIndex < 0 || targetIndex >= videos.length) {
      return;
    }

    setIsLoading(true);
    setError(null);

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
        setIsLoading(false);
        onVideoReady();
      }
    });
  };

  // Simple video control - only play if user has interacted
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
  const handleUserInteraction = () => {
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
  };

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
        setError('Video failed to load');
        setIsLoading(false);
      }
    };

    const handleVideoLoaded = () => {
      if (isActive) {
        console.log('✅ Video loaded:', videoData.post.id);
        setIsLoading(false);
        setError(null);
      }
    };

    const handleVideoClick = () => {
      if (isActive && !userHasInteracted) {
        handleUserInteraction();
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
        />

        {/* Click to play overlay - only show for first interaction */}
        {isActive && !userHasInteracted && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
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
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <div className="text-white text-xl">Loading video...</div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
          <div className="text-red-500 text-xl">{error}</div>
        </div>
      )}

      {/* Scrolling container - like social branch */}
      <motion.div
        className="relative w-full h-full"
        style={{ y }}
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
  );
}