'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Play, Pause, Volume2, VolumeX, Heart, User, CheckCircle, ChevronLeft, ChevronRight, Facebook, Twitter, Download } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import { remixCache } from '@/lib/remixCache';

interface VideoCarouselProps {
  item: SoraFeedItem;
  isActive: boolean;
  isUpcoming?: boolean;
  onAddToFavorites?: (item: SoraFeedItem) => void;
  onRemoveFromFavorites?: (postId: string) => void;
  isInFavorites?: (postId: string) => boolean;
  onControlsChange?: (showing: boolean) => void;
}

export default function VideoCarousel({
  item,
  isActive,
  isUpcoming: _isUpcoming, // Keep for interface compatibility but mark as unused
  onAddToFavorites,
  onRemoveFromFavorites,
  isInFavorites,
  onControlsChange
}: VideoCarouselProps) {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Remix state
  const [remixFeed, setRemixFeed] = useState<SoraFeedItem[]>([]);
  const [currentRemixIndex, setCurrentRemixIndex] = useState(0);
  const [loadingRemixes, setLoadingRemixes] = useState(false);
  
  // Video refs - map by item ID for stable references
  const videoRefsMap = useRef<Map<string, HTMLVideoElement>>(new Map());
  const userPausedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  
  // Track isActive and remix count with refs so watchDrag can always access the latest values
  // (avoids stale closure issue - watchDrag is created once and captures props)
  const isActiveRef = useRef(isActive);
  const remixCountRef = useRef(0);
  
  // Configure Embla for horizontal scrolling with simple, reliable settings
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: 'x',
    loop: false,
    skipSnaps: false,
    dragFree: false,
    containScroll: 'trimSnaps',
    startIndex: 0,
    dragThreshold: 8, // Low threshold for responsive horizontal swiping
    inViewThreshold: 0.7, // Snap when 70% of slide is visible
    watchDrag: (emblaApi, evt) => {
      // Allow horizontal dragging when active AND when there are remixes to swipe through
      // Use refs to avoid stale closure - they always have the latest values
      const currentIsActive = isActiveRef.current;
      const hasRemixes = remixCountRef.current > 0;
      const allowed = currentIsActive && hasRemixes;
      
      if (evt.type.includes('down') || evt.type.includes('start')) {
        console.log('🟧 HORIZONTAL: Drag START', { isActive: currentIsActive, hasRemixes, allowed });
      } else if (evt.type.includes('move') && allowed) {
        // Only log once when locked to horizontal
        console.log('🟧 HORIZONTAL: LOCKED to horizontal axis');
      }
      
      return allowed;
    }
  });

  // Get all available items (original + remixes)
  const getAllItems = useCallback((): SoraFeedItem[] => {
    return [item, ...remixFeed];
  }, [item, remixFeed]);

  // Get current item based on remix index
  const getCurrentItem = useCallback((): SoraFeedItem => {
    const allItems = getAllItems();
    return allItems[currentRemixIndex] || item;
  }, [currentRemixIndex, getAllItems, item]);

  // Handle slide selection
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const selectedIndex = emblaApi.selectedScrollSnap();
    console.log('🟧 HORIZONTAL: Slide selected', { 
      selectedIndex, 
      previousIndex: currentRemixIndex,
      totalSlides: getAllItems().length 
    });
    setCurrentRemixIndex(selectedIndex);
  }, [emblaApi, currentRemixIndex, getAllItems]);

  // Set up event listeners
  useEffect(() => {
    if (!emblaApi) {
      console.log('🟧 HORIZONTAL: Embla API not ready yet');
      return;
    }
    
    console.log('🟧 HORIZONTAL: Embla API ready, setting up listeners');
    emblaApi.on('select', onSelect);
    onSelect(); // Call once to set initial state
    
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Keyboard navigation for horizontal scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive || !emblaApi) return;
      
      // Don't trigger navigation if user is typing in an input field
      const activeElement = document.activeElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).isContentEditable
      );
      
      if (isTyping) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        emblaApi.scrollPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        emblaApi.scrollNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, emblaApi]);

  // Video control functions
  const getVideoRef = useCallback((itemId: string) => {
    return (el: HTMLVideoElement | null) => {
      if (el) {
        videoRefsMap.current.set(itemId, el);
      } else {
        videoRefsMap.current.delete(itemId);
      }
    };
  }, []);

  const getCurrentVideo = useCallback(() => {
    const currentItem = getCurrentItem();
    return videoRefsMap.current.get(currentItem.post.id) || null;
  }, [getCurrentItem]);

  // Control video playback
  const controlVideoPlayback = useCallback(() => {
    const currentVideo = getCurrentVideo();
    if (!currentVideo) {
      console.log('🎬 No current video found');
      return;
    }

    // Use ref to avoid stale closure
    const currentIsActive = isActiveRef.current;
    const shouldPlay = currentIsActive && !userPausedRef.current;
    
    console.log('🎬 Control playback', { 
      isActive: currentIsActive, 
      userPaused: userPausedRef.current, 
      shouldPlay,
      videoPaused: currentVideo.paused,
      isMuted 
    });

    if (shouldPlay) {
      if (currentVideo.paused) {
        console.log('▶️ Playing video');
        currentVideo.play().catch(err => {
          console.log('Play failed:', err);
          setIsPlaying(false);
        });
        setIsPlaying(true);
      }
    } else {
      if (!currentVideo.paused) {
        console.log('⏸️ Pausing video');
        currentVideo.pause();
        setIsPlaying(false);
      }
    }

    // Mute/unmute - use ref
    currentVideo.muted = isMuted || !currentIsActive;
    
    // Pause other videos in this carousel
    videoRefsMap.current.forEach((video, itemId) => {
      if (itemId !== getCurrentItem().post.id && !video.paused) {
        console.log('⏸️ Pausing other video in carousel:', itemId);
        video.pause();
      }
    });
    
    // If this carousel is not active, pause ALL videos including current one
    if (!currentIsActive) {
      videoRefsMap.current.forEach((video, itemId) => {
        if (!video.paused) {
          console.log('⏸️ Pausing video (carousel not active):', itemId);
          video.pause();
        }
      });
    }
  }, [isMuted, getCurrentVideo, getCurrentItem]);

  // Effect to control video playback
  useEffect(() => {
    controlVideoPlayback();
  }, [isActive, currentRemixIndex, isMuted, controlVideoPlayback]);

  // Load remix feed
  useEffect(() => {
    if (isActive && remixFeed.length === 0 && !loadingRemixes) {
      console.log('🟧 HORIZONTAL: Loading remix feed for', item.post.id);
      const loadRemixFeed = async () => {
        setLoadingRemixes(true);
        try {
          const remixes = await remixCache.getRemixFeed(item.post.id);
          console.log('🟧 HORIZONTAL: Loaded', remixes.length, 'remixes');
          setRemixFeed(remixes);
        } catch (error) {
          console.error('🟧 HORIZONTAL: Failed to load remix feed:', error);
          setRemixFeed([]);
        } finally {
          setLoadingRemixes(false);
        }
      };
      
      loadRemixFeed();
    }
  }, [isActive, remixFeed.length, loadingRemixes, item.post.id]);

  // Sync refs with props/state (so watchDrag always has latest values)
  useEffect(() => {
    isActiveRef.current = isActive;
    
    // When video becomes inactive, pause all videos and reset user pause state
    if (!isActive) {
      console.log('🔄 Video became inactive, pausing all videos and resetting userPaused');
      
      // Immediately pause all videos in this carousel
      videoRefsMap.current.forEach((video, itemId) => {
        if (!video.paused) {
          console.log('⏸️ Force pausing video (became inactive):', itemId);
          video.pause();
        }
      });
      
      // Reset user pause state so videos auto-play when scrolled back to them
      if (userPausedRef.current) {
        userPausedRef.current = false;
      }
      
      // Update UI state
      setIsPlaying(false);
    }
  }, [isActive]);

  useEffect(() => {
    remixCountRef.current = remixFeed.length;
  }, [remixFeed.length]);

  // Log when isActive changes (for debugging)
  useEffect(() => {
    console.log('🟧 HORIZONTAL: isActive changed', { 
      isActive, 
      postId: item.post.id,
      hasRemixes: remixFeed.length > 0,
      remixCount: remixFeed.length 
    });
  }, [isActive, item.post.id, remixFeed.length]);

  // Reset state when item changes
  useEffect(() => {
    console.log('🔄 Item changed, resetting state for', item.post.id);
    
    // Cleanup all videos
    videoRefsMap.current.forEach(video => {
      video.pause();
      video.muted = true;
      video.currentTime = 0;
    });
    videoRefsMap.current.clear();
    
    // Reset state
    setRemixFeed([]);
    setCurrentRemixIndex(0);
    setLoadingRemixes(false);
    setIsPlaying(false);
    userPausedRef.current = false;
    hasUserInteractedRef.current = false;
    
    console.log('🔄 Reset complete, userPaused = false');
    
    // Reset carousel to first slide
    if (emblaApi) {
      emblaApi.scrollTo(0, true);
    }
  }, [item.post.id, emblaApi]);

  // Update favorites
  useEffect(() => {
    if (isInFavorites) {
      setIsLiked(isInFavorites(getCurrentItem().post.id));
    }
  }, [getCurrentItem, isInFavorites]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                            (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Controls visibility
  useEffect(() => {
    setShowControls(!isPlaying);
    if (onControlsChange) {
      onControlsChange(!isPlaying);
    }
  }, [isPlaying, onControlsChange]);

  // Event handlers
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    const currentVideo = getCurrentVideo();
    if (!currentVideo) {
      console.log('🎬 Click: No current video');
      return;
    }
    
    console.log('🎬 Video clicked', { 
      wasPaused: currentVideo.paused,
      userPausedBefore: userPausedRef.current 
    });
    
    if (currentVideo.paused) {
      console.log('▶️ User clicked play');
      currentVideo.play().then(() => {
        setIsPlaying(true);
        userPausedRef.current = false;
        console.log('▶️ Play successful, userPaused = false');
      }).catch((err) => {
        console.log('▶️ Play failed:', err);
        setIsPlaying(false);
      });
    } else {
      console.log('⏸️ User clicked pause');
      currentVideo.pause();
      setIsPlaying(false);
      userPausedRef.current = true;
      console.log('⏸️ Pause successful, userPaused = true');
    }
    
    hasUserInteractedRef.current = true;
  }, [getCurrentVideo]);

  const handleVideoMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.videoWidth && video.videoHeight) {
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
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Render video slide
  const renderVideoSlide = useCallback((videoItem: SoraFeedItem) => {
    const videoUrl = videoItem.post.attachments[0]?.encodings?.md?.path || 
                     videoItem.post.attachments[0]?.encodings?.source?.path;
    
    if (!videoUrl) return null;
    
    
    return (
      <div 
        key={videoItem.post.id}
        className="flex-shrink-0 w-full h-full flex items-center justify-center"
      >
        <div className="relative h-full w-full flex items-center justify-center">
          <div 
            className="relative h-full flex items-center justify-center"
            style={{ 
              width: videoWidth ? `${videoWidth}px` : '100%',
              maxWidth: '100%'
            }}
          >
            <video
              ref={getVideoRef(videoItem.post.id)}
              src={videoUrl}
              className="object-contain block w-full h-full"
              style={{
                width: videoWidth ? `${videoWidth}px` : 'auto',
                height: videoWidth ? 'auto' : '100%',
              }}
              muted={isMuted || !isActive}
              playsInline
              loop
              onLoadedMetadata={handleVideoMetadata}
              preload="auto"
            >
              <source src={videoUrl} type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    );
  }, [videoWidth, isMuted, isActive, getVideoRef, handleVideoMetadata]);

  const currentItem = getCurrentItem();
  const allItems = getAllItems();
  const hasRemixes = remixFeed.length > 0;
  const canGoLeft = currentRemixIndex > 0;
  const canGoRight = currentRemixIndex < allItems.length - 1;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Video Carousel Container */}
      <div 
        className="h-full cursor-pointer select-none"
        onClick={handleVideoClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="h-full" ref={emblaRef}>
          <div className="flex h-full">
            {allItems.map((videoItem) => renderVideoSlide(videoItem))}
          </div>
        </div>
      </div>
      
      {/* Controls Overlay */}
      <>
        {/* Play/Pause Button - Upper Left Corner - Always Visible */}
        <div 
          className="absolute top-4 z-30"
          style={{ 
            left: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
            opacity: 1,
            transform: 'translateX(0)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: 'auto'
          }}
        >
            <div className="flex flex-col gap-2">
              {/* Play/Pause Button */}
              <button
                onClick={handleVideoClick}
                className="bg-black/50 rounded-full p-2 hover:bg-black/70 transition-all cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white fill-white" />
                ) : (
                  <Play className="w-5 h-5 text-white fill-white" />
                )}
              </button>
              
              {/* Mute Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="bg-black/50 rounded-full p-2 hover:bg-black/70 transition-all cursor-pointer"
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>
        
      </>
      
      {/* Description and Username - positioned as overlay above remix indicator */}
      <div 
        className="absolute bottom-20 z-40 max-w-xs"
        style={{ 
          left: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
          opacity: showControls ? 1 : 0,
          transform: showControls ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
          pointerEvents: showControls ? 'auto' : 'none'
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">
            {currentItem.profile.display_name || currentItem.profile.username || 'Sora User'}
          </span>
          <CheckCircle className="w-4 h-4 text-blue-400" />
        </div>

        {currentItem.post.text && (
          <div 
            className={`text-white text-xs ${currentItem.post.text.length > 100 ? 'cursor-pointer' : ''}`}
            onClick={(e) => {
              if (currentItem.post.text && currentItem.post.text.length > 100) {
                e.stopPropagation();
                setIsDescriptionExpanded(!isDescriptionExpanded);
              }
            }}
          >
            <p className={isDescriptionExpanded ? '' : 'line-clamp-2'}>
              {currentItem.post.text}
            </p>
            {currentItem.post.text.length > 100 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDescriptionExpanded(!isDescriptionExpanded);
                    }}
                    className="text-white/80 hover:text-white text-xs font-semibold mt-1 cursor-pointer"
                  >
                {isDescriptionExpanded ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Remix Navigation - positioned at very bottom center of video - Always Visible */}
      {hasRemixes && (
        <div 
          className="absolute bottom-4 z-40"
          style={{ 
            left: '50%',
            transform: 'translateX(-50%) translateY(0)',
            opacity: 1,
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: 'auto'
          }}
        >
          <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
            {/* Previous Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (emblaApi) emblaApi.scrollPrev();
              }}
              disabled={!canGoLeft}
              className={`p-2 rounded-full transition-all ${
                canGoLeft 
                  ? 'bg-white/20 hover:bg-white/30 text-white cursor-pointer' 
                  : 'bg-white/10 text-white/50 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            {/* Remix Dots - limited to max 10 */}
            <div className="flex items-center gap-1 mx-2">
              {(() => {
                const totalItems = allItems.length;
                
                // If 10 or fewer items, show all dots
                if (totalItems <= 10) {
                  return allItems.map((_, index) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (emblaApi) emblaApi.scrollTo(index);
                      }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        currentRemixIndex === index
                          ? 'bg-white scale-125' 
                          : 'bg-white/50 hover:bg-white/70'
                      }`}
                    />
                  ));
                }
                
                // More than 10 items - show smart pagination
                const dots = [];
                const maxDots = 10;
                const halfMax = Math.floor(maxDots / 2);
                
                let startIndex = Math.max(0, currentRemixIndex - halfMax);
                const endIndex = Math.min(totalItems - 1, startIndex + maxDots - 1);
                
                // Adjust if we're near the end
                if (endIndex - startIndex < maxDots - 1) {
                  startIndex = Math.max(0, endIndex - maxDots + 1);
                }
                
                for (let i = startIndex; i <= endIndex; i++) {
                  dots.push(
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (emblaApi) emblaApi.scrollTo(i);
                      }}
                      className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                        currentRemixIndex === i
                          ? 'bg-white scale-125' 
                          : 'bg-white/50 hover:bg-white/70'
                      }`}
                    />
                  );
                }
                
                return dots;
              })()}
            </div>
            
            {/* Next Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (emblaApi) emblaApi.scrollNext();
              }}
              disabled={!canGoRight}
              className={`p-2 rounded-full transition-all ${
                canGoRight 
                  ? 'bg-white/20 hover:bg-white/30 text-white cursor-pointer' 
                  : 'bg-white/10 text-white/50 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Action Menu - positioned at bottom right corner of video */}
      <div 
        className="absolute bottom-4 z-40"
        style={{ 
          right: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
          opacity: showControls ? 1 : 0,
          transform: showControls ? 'translateX(0)' : 'translateX(20px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
          pointerEvents: showControls ? 'auto' : 'none'
        }}
      >
        <div className="flex flex-col gap-3">
          {/* Facebook Share Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const url = encodeURIComponent(`https://sora.chatgpt.com/p/${currentItem.post.id}`);
              const text = encodeURIComponent(currentItem.post.text || 'Check out this amazing Sora video!');
              window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank', 'width=600,height=400');
            }}
            className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-all cursor-pointer"
          >
            <Facebook className="w-5 h-5 text-white" />
          </button>
          
          {/* Twitter Share Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const url = encodeURIComponent(`https://sora.chatgpt.com/p/${currentItem.post.id}`);
              const text = encodeURIComponent(currentItem.post.text || 'Check out this amazing Sora video!');
              window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank', 'width=600,height=400');
            }}
            className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-all cursor-pointer"
          >
            <Twitter className="w-5 h-5 text-white" />
          </button>
          
          {/* Download Button */}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const videoUrl = currentItem.post.attachments[0]?.encodings?.source?.path || 
                             currentItem.post.attachments[0]?.encodings?.md?.path;
              if (videoUrl) {
                try {
                  // Fetch the video as a blob
                  const response = await fetch(videoUrl);
                  const blob = await response.blob();
                  
                  // Create a blob URL
                  const blobUrl = window.URL.createObjectURL(blob);
                  
                  // Create download link
                  const link = document.createElement('a');
                  link.href = blobUrl;
                  link.download = `sora-video-${currentItem.post.id}.mp4`;
                  link.style.display = 'none';
                  
                  // Trigger download
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  
                  // Clean up blob URL
                  window.URL.revokeObjectURL(blobUrl);
                } catch (error) {
                  console.error('Download failed:', error);
                  // Fallback: open in new tab with download attribute
                  const link = document.createElement('a');
                  link.href = videoUrl;
                  link.download = `sora-video-${currentItem.post.id}.mp4`;
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }
            }}
            className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-all cursor-pointer"
          >
            <Download className="w-5 h-5 text-white" />
          </button>

          {/* Like Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isLiked) {
                onRemoveFromFavorites?.(currentItem.post.id);
                setIsLiked(false);
              } else {
                onAddToFavorites?.(currentItem);
                setIsLiked(true);
              }
            }}
            className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-all cursor-pointer"
          >
            <Heart 
              className={`w-5 h-5 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} 
            />
          </button>
        </div>
      </div>
    </div>
  );
}
