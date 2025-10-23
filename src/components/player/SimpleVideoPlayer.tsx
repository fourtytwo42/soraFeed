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
  const y = useMotionValue(0);

  // Video control effect
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !video) return;

    console.log('🎮 Video control - isPlaying:', isPlaying, 'paused:', videoElement.paused);

    if (isPlaying && !videoElement.paused) return;
    if (!isPlaying && videoElement.paused) return;

    if (isPlaying) {
      videoElement.play().catch(err => {
        console.error('Failed to play video:', err);
        if (err.name === 'NotAllowedError') {
          console.log('🚫 Autoplay blocked by browser');
          onAutoplayBlocked?.();
        } else {
          setError('Failed to play video');
        }
      });
    } else {
      videoElement.pause();
    }
  }, [isPlaying, video, onAutoplayBlocked]);

  // Mute control effect
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    videoElement.muted = isMuted;
  }, [isMuted]);

  // Video change effect with smooth transition
  useEffect(() => {
    if (!video) {
      setIsLoading(true);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Animate transition
    animate(y, -window.innerHeight, {
      type: 'spring',
      stiffness: 400,
      damping: 40,
      onComplete: () => {
        y.set(0);
        setIsLoading(false);
        onVideoReady();
      }
    });
  }, [video, y, onVideoReady]);

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

  if (!video) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-white text-xl">No video loaded</div>
      </div>
    );
  }

  const videoUrl = video.post.attachments?.[0]?.encodings?.md?.path || 
                   video.post.attachments?.[0]?.encodings?.source?.path;

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-white text-xl">Video URL not available</div>
      </div>
    );
  }

  return (
    <motion.div 
      className="relative w-full h-full bg-black overflow-hidden"
      style={{ y }}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <div className="text-white text-xl">Loading video...</div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-red-500 text-xl">{error}</div>
        </div>
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        src={videoUrl}
        loop={false}
        playsInline
        preload="auto"
        onEnded={handleVideoEnd}
        onError={handleVideoError}
        onLoadedData={handleVideoLoaded}
        onCanPlayThrough={handleVideoLoaded}
      />

      {/* Video info overlay (minimal) */}
      <div className="absolute bottom-4 left-4 right-4 text-white">
        <div className="text-sm opacity-70">
          {video.profile.username} • {video.post.text?.slice(0, 100)}
        </div>
      </div>
    </motion.div>
  );
}
