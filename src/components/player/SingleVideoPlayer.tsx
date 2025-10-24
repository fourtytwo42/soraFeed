'use client';

import { useRef, useEffect, memo } from 'react';
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
  onUserInteraction
}: SingleVideoPlayerProps) {
  console.log('🔄 SingleVideoPlayer rendering for:', videoData.post.id.slice(-6), 'index:', index);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoLoadedRef = useRef(false); // Track if video has loaded data
  const playingRef = useRef(false); // Track if we're currently trying to play
  const lastPlayedTimeRef = useRef(0); // Track last time we called play() to prevent rapid calls
  const isPlayingRef = useRef(isPlaying); // Ref to track isPlaying without causing re-renders
  const isActive = index === currentIndex;
  const offset = index - currentIndex;

  // Update ref when isPlaying changes
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const videoUrl = videoData.post.attachments?.[0]?.encodings?.md?.path || 
                   videoData.post.attachments?.[0]?.encodings?.source?.path;

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-white text-xl">Video URL not available</div>
      </div>
    );
  }

  // Video control effect - poll-based instead of dependency-driven
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

      if (userHasInteracted) {
        if (shouldBePlaying && !isCurrentlyPlaying && !playingRef.current) {
          const now = Date.now();
          const timeSinceLastPlay = now - lastPlayedTimeRef.current;
          
          // Only play if we haven't tried recently AND video isn't in a transient state
          if (timeSinceLastPlay < 3000) {
            // Don't try to play again within 3 seconds
            return;
          }

          // Double-check the video isn't already playing or trying to play
          if (video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 2) {
            // Video is actually playing, don't call play() again
            return;
          }
          
          console.log('▶️ Starting video playback:', videoData.post.id.slice(-6), {
            currentTime: video.currentTime,
            paused: video.paused,
            readyState: video.readyState
          });
          lastPlayedTimeRef.current = now;
          playingRef.current = true;
          video.play().then(() => {
            playingRef.current = false;
            console.log('✅ Video playing successfully');
          }).catch(err => {
            console.error('❌ Failed to play video:', err);
            playingRef.current = false;
            onAutoplayBlocked?.();
          });
        } else if (!shouldBePlaying && isCurrentlyPlaying && !playingRef.current) {
          console.log('⏸️ Pausing video:', videoData.post.id.slice(-6));
          video.pause();
        }
      } else if (!userHasInteracted && video.paused) {
        onAutoplayBlocked?.();
      }
    };

    // Run check immediately
    checkVideoState();

    // Then poll every 500ms
    const interval = setInterval(checkVideoState, 500);

    return () => clearInterval(interval);
  }, [isActive, userHasInteracted, videoData.post.id, onAutoplayBlocked]);

  // Mute control - only update if actually different
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.muted !== isMuted) {
      console.log('🔇 Changing mute state:', isMuted);
      video.muted = isMuted;
    }
  }, [isMuted]);

  const handleVideoClick = () => {
    if (!isActive || !videoLoadedRef.current) return;
    
    console.log('🎬 Video clicked - delegating to parent');
    
    if (!userHasInteracted) {
      // First interaction
      onUserInteraction();
    } else {
      // Delegate to parent component (which will update database)
      onVideoClick?.();
    }
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
      className="absolute inset-0 w-full h-full cursor-pointer"
      style={{ 
        transform: `translateY(${offset * 100}%)`,
        zIndex: isActive ? 20 : 10
      }}
      onClick={handleVideoClick}
    >
      <video
        key={videoData.post.id} // Stable key to prevent recreation
        ref={videoRef}
        className="w-full h-full object-cover"
        src={videoUrl}
        loop={false}
        playsInline
        preload="auto"
        muted={isMuted}
        onLoadedMetadata={() => {
          // Only mark as loaded when metadata is first loaded
          // This fires ONCE per video, unlike onCanPlay/onLoadedData
          if (!videoLoadedRef.current) {
            console.log('🎬 Video metadata loaded:', videoData.post.id.slice(-6));
            videoLoadedRef.current = true;
          } else {
            console.error('🚨 METADATA LOADED AGAIN - VIDEO ELEMENT RECREATED!', videoData.post.id.slice(-6));
          }
        }}
        onEnded={() => {
          if (isActive) {
            console.log('🎬 Video ended:', videoData.post.id);
            onVideoEnd();
          }
        }}
        onError={() => {
          console.error('❌ Video error:', videoData.post.id);
        }}
      />

      {/* Click to play overlay */}
      {isActive && (!userHasInteracted || !isPlaying) && videoLoadedRef.current && (
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
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if these specific props change
  return (
    prevProps.videoData.post.id === nextProps.videoData.post.id &&
    prevProps.index === nextProps.index &&
    prevProps.currentIndex === nextProps.currentIndex &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.isMuted === nextProps.isMuted &&
    prevProps.userHasInteracted === nextProps.userHasInteracted
  );
});

export default SingleVideoPlayer;

