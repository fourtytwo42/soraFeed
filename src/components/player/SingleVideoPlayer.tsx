'use client';

import { useRef, useEffect, memo, useState } from 'react';
import { SoraFeedItem } from '@/types/sora';

interface SingleVideoPlayerProps {
  videoData: SoraFeedItem;
  index: number;
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  userHasInteracted: boolean;
  onVideoEnd: () => void;
  onAutoplayBlocked?: () => void;
  onVideoClick?: () => void;
  onUserInteraction: () => void;
  onMuteToggle?: () => void;
}

// Single Video Component - memoized and OUTSIDE parent to prevent recreation
const SingleVideoPlayer = memo(function SingleVideoPlayer({
  videoData,
  index,
  currentIndex,
  isPlaying,
  isMuted,
  userHasInteracted,
  onVideoEnd,
  onAutoplayBlocked,
  onVideoClick,
  onUserInteraction,
  onMuteToggle
}: SingleVideoPlayerProps) {
  console.log('🔄 SingleVideoPlayer rendering for:', videoData.post.id.slice(-6), 'index:', index);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoLoadedRef = useRef(false); // Track if video has loaded data
  const playingRef = useRef(false); // Track if we're currently trying to play
  const lastPlayedTimeRef = useRef(0); // Track last time we called play() to prevent rapid calls
  const isPlayingRef = useRef(isPlaying); // Ref to track isPlaying without causing re-renders
  const isActive = index === currentIndex;
  const offset = index - currentIndex;
  
  // Video sizing state
  const [videoWidth, setVideoWidth] = useState<number | null>(null);

  // Update ref when isPlaying changes
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Handle video metadata to calculate proper sizing
  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      const aspectRatio = video.videoWidth / video.videoHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // If landscape (wider than tall), fit to width
      // If portrait (taller than wide), fit to height
      if (aspectRatio > 1) {
        // Landscape: fit to width
        setVideoWidth(viewportWidth);
      } else {
        // Portrait: fit to height
        const calculatedWidth = viewportHeight * aspectRatio;
        setVideoWidth(calculatedWidth);
      }
    }
  };

  // Handle window resize to recalculate video sizing
  useEffect(() => {
    const handleResize = () => {
      const video = videoRef.current;
      if (video && video.videoWidth && video.videoHeight) {
        const aspectRatio = video.videoWidth / video.videoHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (aspectRatio > 1) {
          setVideoWidth(viewportWidth);
        } else {
          const calculatedWidth = viewportHeight * aspectRatio;
          setVideoWidth(calculatedWidth);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const videoUrl = videoData.post.attachments?.[0]?.encodings?.md?.path || 
                   videoData.post.attachments?.[0]?.encodings?.source?.path;

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-white text-xl">Video URL not available</div>
      </div>
    );
  }

  // Video control effect - rely on autoplay attribute and poll-based for pause
  useEffect(() => {
    if (!isActive) return;

    const video = videoRef.current;
    if (!video) return;

    // Poll video state every 500ms to sync with database state
    const checkVideoState = () => {
      // Only control video if it has loaded some data
      if (!videoLoadedRef.current) return;

      const shouldBePlaying = isPlayingRef.current;
      const isCurrentlyPlaying = !video.paused;

      // Only handle pause - autoplay attribute handles playing
      if (!shouldBePlaying && isCurrentlyPlaying && !playingRef.current) {
        video.pause();
      }
    };

    // Run check immediately
    checkVideoState();

    // Then poll every 500ms
    const interval = setInterval(checkVideoState, 500);

    return () => clearInterval(interval);
  }, [isActive, videoData.post.id]);

  // Handle mute state changes - but only after initial autoplay and only when triggered by user
  // This ref tracks if user has clicked the mute button
  const userClickedMute = useRef(false);
  
  // Track when user clicks mute button
  const handleMuteClick = () => {
    userClickedMute.current = true;
    onMuteToggle?.();
  };
  
  useEffect(() => {
    const video = videoRef.current;
    if (video && isActive && videoLoadedRef.current) {
      // Only apply mute state changes if user has clicked the mute button
      if (userClickedMute.current && video.muted !== isMuted) {
        video.muted = isMuted;
        // If unmuting, try to play in case the video got paused
        if (!isMuted && video.paused) {
          video.play().catch(err => {
            console.error('Unmuting failed:', err);
          });
        }
      }
    }
  }, [isMuted, isActive, onMuteToggle]);

  // Note: Video is always muted for autoplay to work
  // We handle unmuting when user clicks the mute button

  const handleVideoClick = () => {
    if (!isActive || !videoLoadedRef.current) return;
    
    // Just delegate to parent component (which will update database)
    onVideoClick?.();
  };



  // Reset videoLoadedRef when video actually changes (not just re-renders)
  const videoIdRef = useRef(videoData.post.id);
  if (videoIdRef.current !== videoData.post.id) {
    console.log('📹 Video changed from', videoIdRef.current, 'to', videoData.post.id);
    videoIdRef.current = videoData.post.id;
    videoLoadedRef.current = false;
  }

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Reset refs when component unmounts
      videoLoadedRef.current = false;
      playingRef.current = false;
    };
  }, []);

  return (
    <div 
      className="absolute inset-0 w-full h-full cursor-pointer flex items-center justify-center"
      style={{ 
        transform: `translateY(${offset * 100}%)`,
        zIndex: isActive ? 20 : 10
      }}
      onClick={handleVideoClick}
    >
      <div 
        className="relative h-full flex items-center justify-center"
        style={{ 
          width: videoWidth ? `${videoWidth}px` : '100%',
          maxWidth: '100%'
        }}
      >
        <video
          key={videoData.post.id} // Stable key to prevent recreation
          ref={videoRef}
          className="object-contain block"
          style={{
            width: videoWidth ? `${videoWidth}px` : 'auto',
            height: videoWidth ? 'auto' : '100%'
          }}
          src={videoUrl}
          autoPlay
          loop={false}
          playsInline
          preload="auto"
          muted={isMuted}
          onLoadedMetadata={(e) => {
            // Handle video sizing first
            handleVideoMetadata(e);
            
            // Only mark as loaded when metadata is first loaded
            // This fires ONCE per video, unlike onCanPlay/onLoadedData
            if (!videoLoadedRef.current) {
              videoLoadedRef.current = true;
            }
          }}
          onPlay={() => {
            // Mark user as interacted when video starts playing (due to autoplay)
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('sorafeed-user-interacted', 'true');
            }
            onUserInteraction();
          }}
          onEnded={() => {
            if (isActive) {
              console.log('🎬 Video ended:', videoData.post.id);
              onVideoEnd();
            }
          }}
          onError={(e) => {
            console.error('❌ Video error:', videoData.post.id, e);
          }}
        />
      </div>



      {/* Video info overlay */}
      <div className="absolute bottom-4 left-4 text-white pointer-events-none" style={{ right: '120px' }}>
        <div className="text-sm opacity-70 bg-black bg-opacity-50 px-3 py-2 rounded inline-block max-w-full">
          <div className="truncate whitespace-nowrap">
            @{videoData.profile.username} • {videoData.post.text || ''}
          </div>
        </div>
      </div>

      {/* CH 42 Watermark */}
      <div className="absolute bottom-4 right-4 text-white pointer-events-none z-40">
        <div className="text-2xl font-bold opacity-60 drop-shadow-lg">
          CH 42
        </div>
      </div>

      {/* Mute Overlay Button - only show when muted and active */}
      {(() => {
        const shouldShowMuteButton = isActive && isMuted && videoLoadedRef.current && onMuteToggle;
        console.log('🔇 Mute button conditions:', {
          isActive,
          isMuted,
          videoLoaded: videoLoadedRef.current,
          hasOnMuteToggle: !!onMuteToggle,
          shouldShow: shouldShowMuteButton
        });
        return shouldShowMuteButton;
      })() && (
        <div 
          className="absolute inset-0 flex items-center justify-center z-50"
          onClick={(e) => {
            e.stopPropagation();
            console.log('🔇 Mute overlay clicked');
            handleMuteClick();
          }}
        >
          <button
            className="bg-black/60 hover:bg-black/80 rounded-full p-6 transition-all cursor-pointer group"
            title="Click to unmute"
          >
            <div className="relative w-16 h-16">
              {/* Speaker icon */}
              <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              {/* X overlay - diagonal cross */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="absolute w-16 h-1 bg-white transform rotate-45 origin-center"></div>
                <div className="absolute w-16 h-1 bg-white transform -rotate-45 origin-center"></div>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if these specific props change
  return (
    prevProps.videoData.post.id === nextProps.videoData.post.id &&
    prevProps.index === nextProps.index &&
    prevProps.currentIndex === nextProps.currentIndex &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.isMuted === nextProps.isMuted &&
    prevProps.userHasInteracted === nextProps.userHasInteracted &&
    prevProps.onMuteToggle === nextProps.onMuteToggle
  );
});

export default SingleVideoPlayer;


