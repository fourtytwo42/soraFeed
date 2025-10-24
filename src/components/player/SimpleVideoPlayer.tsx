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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentVideo, setCurrentVideo] = useState<SoraFeedItem | null>(null);
  const [nextVideo, setNextVideo] = useState<SoraFeedItem | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [screenHeight, setScreenHeight] = useState(0);
  const containerY = useMotionValue(0);

  // Get screen height on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setScreenHeight(window.innerHeight);
      
      const handleResize = () => setScreenHeight(window.innerHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Video control effect
  useEffect(() => {
    const videoElement = videoRef.current;
    
    console.log('🎮 Video control effect triggered:', {
      hasVideoElement: !!videoElement,
      hasVideo: !!video,
      isPlaying,
      isTransitioning,
      videoSrc: videoElement?.src?.slice(-20) || 'none',
      videoPaused: videoElement?.paused,
      videoReadyState: videoElement?.readyState
    });

    if (!videoElement || !video) {
      console.log('⏸️ No video element or video data, skipping control');
      return;
    }

    // Don't control video during transitions - let the transition complete first
    if (isTransitioning) {
      console.log('⏸️ Skipping video control during transition');
      return;
    }

    if (isPlaying && !videoElement.paused) {
      console.log('✅ Video already playing, no action needed');
      return;
    }
    if (!isPlaying && videoElement.paused) {
      console.log('✅ Video already paused, no action needed');
      return;
    }

    if (isPlaying) {
      console.log('🎬 Attempting to play video, readyState:', videoElement.readyState);
      
      // Check if video is ready to play
      if (videoElement.readyState < 2) { // HAVE_CURRENT_DATA
        console.log('⏳ Video not ready yet, waiting for loadeddata event');
        const handleLoadedData = () => {
          console.log('✅ Video data loaded, attempting play');
          videoElement.play().then(() => {
            console.log('✅ Video playing successfully after load');
            setError(null);
          }).catch(err => {
            console.error('❌ Failed to play video after load:', err);
            if (err.name === 'NotAllowedError') {
              console.log('🚫 Autoplay blocked after load, trying muted');
              videoElement.muted = true;
              videoElement.play().then(() => {
                console.log('✅ Video playing successfully after load (muted)');
                setError(null);
              }).catch(mutedErr => {
                console.error('❌ Failed to play even muted after load:', mutedErr);
                onAutoplayBlocked?.();
              });
            }
          });
          videoElement.removeEventListener('loadeddata', handleLoadedData);
        };
        videoElement.addEventListener('loadeddata', handleLoadedData);
        return;
      }
      
      const playPromise = videoElement.play();
      if (playPromise) {
        playPromise.then(() => {
          console.log('✅ Video playing successfully');
          setError(null);
        }).catch(err => {
          console.error('❌ Failed to play video:', err);
          if (err.name === 'NotAllowedError') {
            console.log('🚫 Autoplay blocked, trying muted playback');
            // Try playing muted as fallback
            videoElement.muted = true;
            videoElement.play().then(() => {
              console.log('✅ Video playing successfully (muted)');
              setError(null);
            }).catch(mutedErr => {
              console.error('❌ Failed to play even muted:', mutedErr);
              onAutoplayBlocked?.();
            });
          } else {
            setError('Failed to play video');
          }
        });
      }
    } else {
      console.log('⏸️ Pausing video');
      videoElement.pause();
    }
  }, [isPlaying, video, onAutoplayBlocked, isTransitioning]);

  // Mute control effect
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    videoElement.muted = isMuted;
  }, [isMuted]);

  // Video change effect with scroll transition
  useEffect(() => {
    if (!video) {
      setCurrentVideo(null);
      setNextVideo(null);
      setIsLoading(true);
      setError(null);
      return;
    }

    // If this is the first video, just set it directly
    if (!currentVideo) {
      setCurrentVideo(video);
      setIsLoading(false);
      setError(null);
      onVideoReady();
      return;
    }

    // If video changed, start transition
    if (currentVideo && video.post.id !== currentVideo.post.id) {
      setIsTransitioning(true);
      setNextVideo(video);
      setIsLoading(true);
      setError(null);

      // Start scroll animation
      animate(containerY, -screenHeight, {
        type: 'spring',
        stiffness: 300,
        damping: 30,
        duration: 0.8,
        onComplete: () => {
          console.log('🎬 Transition complete, swapping videos');
          // Swap videos and reset position
          setCurrentVideo(video);
          setNextVideo(null);
          setIsTransitioning(false);
          containerY.set(0);
          setIsLoading(false);
          onVideoReady();
          
          // Force play the new video after a short delay to ensure ref is attached
          setTimeout(() => {
            const videoElement = videoRef.current;
            if (videoElement && isPlaying) {
              console.log('🎬 Force playing new video after transition');
              videoElement.play().catch(err => {
                console.error('❌ Failed to play video after transition:', err);
              });
            }
          }, 100);
        }
      });
    }
  }, [video, currentVideo, containerY, onVideoReady, screenHeight, isPlaying]);

  const handleVideoEnd = () => {
    console.log('🎬 Video ended:', video?.post.id);
    onVideoEnd();
  };

  const handleVideoError = () => {
    console.error('❌ Video error:', video?.post.id);
    setError('Video failed to load');
    setIsLoading(false);
  };

  const handleVideoLoaded = () => {
    console.log('✅ Video loaded:', video?.post.id);
    setIsLoading(false);
    setError(null);
  };

  // Component to render a single video
  const VideoComponent = ({ videoData, isActive }: { videoData: SoraFeedItem; isActive: boolean }) => {
    const videoUrl = videoData.post.attachments?.[0]?.encodings?.md?.path || 
                     videoData.post.attachments?.[0]?.encodings?.source?.path;

    console.log(`🎥 VideoComponent render - videoId: ${videoData.post.id.slice(-6)}, isActive: ${isActive}, hasRef: ${isActive ? 'yes' : 'no'}`);

    if (!videoUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <div className="text-white text-xl">Video URL not available</div>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full">
        {/* Video element */}
        <video
          ref={isActive ? videoRef : undefined}
          className="w-full h-full object-cover"
          src={videoUrl}
          loop={false}
          playsInline
          preload="auto"
          muted={isMuted}
          onEnded={isActive ? handleVideoEnd : undefined}
          onError={isActive ? handleVideoError : undefined}
          onLoadedData={isActive ? handleVideoLoaded : undefined}
          onCanPlayThrough={isActive ? handleVideoLoaded : undefined}
          onLoadStart={() => isActive && console.log('🎥 Video load started')}
          onCanPlay={() => isActive && console.log('🎥 Video can play')}
          onPlay={() => isActive && console.log('🎥 Video play event fired')}
          onPause={() => isActive && console.log('🎥 Video pause event fired')}
        />

        {/* Video info overlay */}
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <div className="text-sm opacity-70 bg-black bg-opacity-50 p-2 rounded">
            @{videoData.profile.username} • {videoData.post.text?.slice(0, 100)}
          </div>
        </div>
      </div>
    );
  };

  if (!currentVideo && !nextVideo) {
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
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <div className="text-white text-xl">Loading video...</div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="text-red-500 text-xl">{error}</div>
        </div>
      )}

      {/* Scrolling container */}
      <motion.div
        className="relative w-full"
        style={{ 
          y: containerY,
          height: isTransitioning ? `${screenHeight * 2}px` : '100vh'
        }}
      >
        {/* Current video */}
        {currentVideo && (
          <div key={`current-${currentVideo.post.id}`} className="w-full h-screen">
            <VideoComponent 
              videoData={currentVideo} 
              isActive={!isTransitioning} // Only active when not transitioning
            />
          </div>
        )}

        {/* Next video (during transition) */}
        {nextVideo && isTransitioning && (
          <div key={`next-${nextVideo.post.id}`} className="w-full h-screen">
            <VideoComponent 
              videoData={nextVideo} 
              isActive={true} // This becomes the active video during transition
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}
