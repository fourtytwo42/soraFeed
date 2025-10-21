'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Play, Volume2, VolumeX, Heart, User, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import { remixCache } from '@/lib/remixCache';
import { useGestureContext } from '@/contexts/GestureContext';

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
  isUpcoming,
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
  
  // Gesture rails system for preventing axis switching
  const gestureRails = useGestureRails(15);
  
  // Configure Embla for horizontal scrolling with rails behavior
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: 'x',
    loop: false,
    skipSnaps: false,
    dragFree: false,
    containScroll: 'trimSnaps',
    startIndex: 0,
    dragThreshold: 20, // Higher threshold for horizontal to prevent accidental triggers
    inViewThreshold: 0.7, // Snap when 70% of slide is visible
    watchDrag: (emblaApi, evt) => {
      // Only allow horizontal dragging when this carousel is active
      if (!isActive) return false;
      
      // Block horizontal dragging if vertical gesture is active
      if (gestureRails.shouldBlockGesture('horizontal')) {
        return false;
      }
      
      // Handle touch/mouse events for gesture detection
      const clientX = evt.type.includes('touch') 
        ? ((evt as TouchEvent).touches[0] || (evt as TouchEvent).changedTouches[0])?.clientX || 0
        : (evt as MouseEvent).clientX;
      const clientY = evt.type.includes('touch') 
        ? ((evt as TouchEvent).touches[0] || (evt as TouchEvent).changedTouches[0])?.clientY || 0
        : (evt as MouseEvent).clientY;
      
      if (evt.type.includes('start') || evt.type === 'mousedown') {
        gestureRails.startGesture(clientX, clientY);
      } else if (evt.type.includes('move') || evt.type === 'mousemove') {
        const direction = gestureRails.updateGesture(clientX, clientY);
        return direction === 'horizontal' || direction === null;
      }
      
      return gestureRails.isGestureActive('horizontal');
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
    setCurrentRemixIndex(selectedIndex);
  }, [emblaApi]);

  // Set up event listeners
  useEffect(() => {
    if (!emblaApi) return;
    
    emblaApi.on('select', onSelect);
    emblaApi.on('settle', () => {
      gestureRails.endGesture();
    });
    emblaApi.on('pointerUp', () => {
      gestureRails.endGesture();
    });
    onSelect(); // Call once to set initial state
    
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('settle', () => {});
      emblaApi.off('pointerUp', () => {});
    };
  }, [emblaApi, onSelect, gestureRails]);

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
    if (!currentVideo) return;

    if (isActive && !userPausedRef.current) {
      if (currentVideo.paused) {
        currentVideo.play().catch(err => console.log('Play failed:', err));
        setIsPlaying(true);
      }
    } else {
      if (!currentVideo.paused) {
        currentVideo.pause();
        setIsPlaying(false);
      }
    }

    // Mute/unmute
    currentVideo.muted = isMuted || !isActive;
    
    // Pause other videos
    videoRefsMap.current.forEach((video, itemId) => {
      if (itemId !== getCurrentItem().post.id && !video.paused) {
        video.pause();
      }
    });
  }, [isActive, isMuted, getCurrentVideo, getCurrentItem]);

  // Effect to control video playback
  useEffect(() => {
    controlVideoPlayback();
  }, [isActive, currentRemixIndex, isMuted, controlVideoPlayback]);

  // Load remix feed
  useEffect(() => {
    if (isActive && remixFeed.length === 0 && !loadingRemixes) {
      const loadRemixFeed = async () => {
        setLoadingRemixes(true);
        try {
          const remixes = await remixCache.getRemixFeed(item.post.id);
          setRemixFeed(remixes);
        } catch (error) {
          console.error('Failed to load remix feed:', error);
          setRemixFeed([]);
        } finally {
          setLoadingRemixes(false);
        }
      };
      
      loadRemixFeed();
    }
  }, [isActive, remixFeed.length, loadingRemixes, item.post.id]);

  // Reset state when item changes
  useEffect(() => {
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
    if (!currentVideo) return;
    
    if (currentVideo.paused) {
      currentVideo.play().then(() => {
        setIsPlaying(true);
        userPausedRef.current = false;
      }).catch(() => {
        setIsPlaying(false);
      });
    } else {
      currentVideo.pause();
      setIsPlaying(false);
      userPausedRef.current = true;
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
  const renderVideoSlide = useCallback((videoItem: SoraFeedItem, index: number) => {
    const videoUrl = videoItem.post.attachments[0]?.encodings?.md?.path || 
                     videoItem.post.attachments[0]?.encodings?.source?.path;
    
    if (!videoUrl) return null;
    
    const isCurrentSlide = index === currentRemixIndex;
    
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
  }, [currentRemixIndex, videoWidth, isMuted, isActive, getVideoRef, handleVideoMetadata]);

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
            {allItems.map((videoItem, index) => renderVideoSlide(videoItem, index))}
          </div>
        </div>
      </div>
      
      {/* Controls Overlay */}
      <>
        {/* Play/Pause Button */}
        {showControls && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="bg-black/50 rounded-full p-4 pointer-events-auto">
              {isPlaying ? (
                <div className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 text-white fill-white" />
              )}
            </div>
          </div>
        )}
        
        {/* Bottom Controls */}
        <div 
          className="absolute bottom-4 left-4 right-4 z-40"
          style={{ 
            opacity: showControls ? 1 : 0,
            transform: showControls ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: showControls ? 'auto' : 'none'
          }}
        >
          {/* Remix Navigation */}
          {hasRemixes && (
            <div className="flex items-center justify-center mb-4">
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
                      ? 'bg-white/20 hover:bg-white/30 text-white' 
                      : 'bg-white/10 text-white/50 cursor-not-allowed'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {/* Remix Dots */}
                <div className="flex items-center gap-1 mx-2">
                  {allItems.map((_, index) => (
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
                  ))}
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
                      ? 'bg-white/20 hover:bg-white/30 text-white' 
                      : 'bg-white/10 text-white/50 cursor-not-allowed'
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          
          {/* Video Info */}
          <div className="flex items-end justify-between">
            {/* Left side - Video info */}
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span className="text-white font-semibold text-sm">
                  Sora User
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
                      className="text-white/80 hover:text-white text-xs font-semibold mt-1"
                    >
                      {isDescriptionExpanded ? 'less' : 'more'}
                    </button>
                  )}
                </div>
              )}
            </div>
          
            {/* Right side - Action buttons */}
            <div className="flex flex-col gap-3">
              {/* Mute Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-all"
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
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
                className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-all"
              >
                <Heart 
                  className={`w-5 h-5 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} 
                />
              </button>
            </div>
          </div>
        </div>
      </>
    </div>
  );
}
