'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Play, Pause, Volume2, VolumeX, Heart, User, CheckCircle, ChevronLeft, ChevronRight, Facebook, Twitter, Download, Monitor, Smartphone, Grid3X3 } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import { remixCache } from '@/lib/remixCache';
import { videoPreloadManager } from '@/lib/videoPreloadManager';

interface VideoCarouselProps {
  item: SoraFeedItem;
  isActive: boolean;
  isUpcoming?: boolean;
  onAddToFavorites?: (item: SoraFeedItem) => void;
  onRemoveFromFavorites?: (postId: string) => void;
  isInFavorites?: (postId: string) => boolean;
  onControlsChange?: (showing: boolean) => void;
  onNext?: () => void;
  onCustomFeedVideoEvent?: (eventType: 'loadedmetadata' | 'ended', videoDuration?: number) => void;
  formatFilter?: 'both' | 'tall' | 'wide';
  onFormatFilterChange?: (filter: 'both' | 'tall' | 'wide') => void;
  nextItem?: SoraFeedItem; // For preloading the next video
}

export default function VideoCarousel({
  item,
  isActive,
  onAddToFavorites,
  onRemoveFromFavorites,
  isInFavorites,
  onControlsChange,
  onNext,
  onCustomFeedVideoEvent,
  formatFilter = 'both',
  onFormatFilterChange,
  nextItem
}: VideoCarouselProps) {
  
  // 🔍 USERNAME LOGGING: Log initial item data in VideoCarousel
  console.log('🎠 VideoCarousel received item:', {
    postId: item.post.id,
    username: item.profile.username,
    displayName: item.profile.display_name,
    userId: item.profile.user_id,
    fullProfile: item.profile
  });
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  
  // Video state monitoring
  const lastKnownVideoState = useRef<{paused: boolean, time: number}>({paused: true, time: 0});
  
  // Remix state
  const [remixFeed, setRemixFeed] = useState<SoraFeedItem[]>([]);
  const [currentRemixIndex, setCurrentRemixIndex] = useState(0);
  const [loadingRemixes, setLoadingRemixes] = useState(false);
  
  // Video refs - map by item ID for stable references
  const videoRefsMap = useRef<Map<string, HTMLVideoElement>>(new Map());
  const userPausedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const lastClickTime = useRef(0);
  
  // Preloading state
  const preloadStartedRef = useRef<string | null>(null);
  
  // Track remix loading to prevent duplicates
  const remixLoadingRef = useRef<string | null>(null);
  
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

  // Virtualized video rendering - only render videos that are visible or adjacent
  const getVisibleVideoIndices = useCallback(() => {
    const allItems = getAllItems();
    const totalItems = allItems.length;
    
    // Only render current video + 1 before and 1 after (3 total max)
    const bufferSize = 1;
    const startIndex = Math.max(0, currentRemixIndex - bufferSize);
    const endIndex = Math.min(totalItems - 1, currentRemixIndex + bufferSize);
    
    return { startIndex, endIndex, totalItems };
  }, [currentRemixIndex, getAllItems]);

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

  // Cleanup video refs that are no longer visible
  useEffect(() => {
    const { startIndex, endIndex } = getVisibleVideoIndices();
    const allItems = getAllItems();
    
    // Remove video refs for items that are no longer in the visible range
    videoRefsMap.current.forEach((video, itemId) => {
      const itemIndex = allItems.findIndex(item => item.post.id === itemId);
      if (itemIndex < startIndex || itemIndex > endIndex) {
        console.log('🧹 Cleaning up video ref for item:', itemId);
        videoRefsMap.current.delete(itemId);
      }
    });
  }, [currentRemixIndex, getVisibleVideoIndices, getAllItems]);

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
        // Set initial mute state when video element is created
        el.muted = !isActive || isMuted;
        console.log('🎬 Video ref created:', { itemId, muted: el.muted, isActive, isMuted });
      } else {
        videoRefsMap.current.delete(itemId);
      }
    };
  }, [isActive, isMuted]);

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

    // Check if current video is in visible range
    const currentItem = getCurrentItem();
    const allItems = getAllItems();
    const currentIndex = allItems.findIndex(item => item.post.id === currentItem.post.id);
    const { startIndex, endIndex } = getVisibleVideoIndices();
    
    if (currentIndex < startIndex || currentIndex > endIndex) {
      console.log('🎬 Video not in visible range, skipping playback control');
      return;
    }

    // Use ref to avoid stale closure
    const currentIsActive = isActiveRef.current;
    const shouldPlay = currentIsActive && !userPausedRef.current;
    
    // Only log control playback in development or when there are issues
    if (process.env.NODE_ENV === 'development' || currentVideo.error) {
      console.log('🎬 Control playback', { 
        isActive: currentIsActive, 
        userPaused: userPausedRef.current, 
        shouldPlay,
        videoPaused: currentVideo.paused,
        isMuted,
        videoReadyState: currentVideo.readyState,
        networkState: currentVideo.networkState,
        error: currentVideo.error?.message
      });
    }

    // Only control playback if video is ready and has no errors
    if (currentVideo.readyState < 2) {
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('🎬 Video not ready yet, skipping playback control');
      }
      return;
    }

    // Check for video errors
    if (currentVideo.error) {
      console.log('❌ Video has error, skipping playback control:', currentVideo.error.message);
      setIsPlaying(false);
      return;
    }

    // Avoid conflicts with recent user clicks (increased timeout)
    const timeSinceLastClick = Date.now() - lastClickTime.current;
    if (timeSinceLastClick < 800) {
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('🎬 Skipping control - recent user click');
      }
      return;
    }

    if (shouldPlay) {
      if (currentVideo.paused) {
        console.log('▶️ Auto-playing video');
        // Add a small delay to prevent rapid play/pause cycles
        setTimeout(() => {
          if (currentVideo.paused && shouldPlay && currentIsActive && !userPausedRef.current) {
            currentVideo.play().then(() => {
              console.log('✅ Auto-play successful');
              // State will be synced by onPlay event
            }).catch(err => {
              console.log('❌ Auto-play failed:', err);
              // Don't set userPausedRef here - let user try again
            });
          }
        }, 50);
      }
      // Note: State sync is now handled by video event listeners (onPlay/onPause)
    } else {
      if (!currentVideo.paused) {
        console.log('⏸️ Auto-pausing video');
        currentVideo.pause();
        // State will be synced by onPause event
      }
    }

    // Mute/unmute - use ref (only set if active to avoid conflicts)
    if (currentIsActive) {
      currentVideo.muted = isMuted;
    } else {
      currentVideo.muted = true; // Always mute inactive videos
    }
    
    // Pause other videos in this carousel (but only if they're not the current one)
    videoRefsMap.current.forEach((video, itemId) => {
      if (itemId !== getCurrentItem().post.id && !video.paused) {
        console.log('⏸️ Pausing other video in carousel:', itemId);
        video.pause();
      }
    });
    
    // If this carousel is not active, pause ALL videos including current one (but be less aggressive)
    if (!currentIsActive) {
      // Add a delay to prevent pausing during quick transitions
      setTimeout(() => {
        if (!isActiveRef.current) {
          videoRefsMap.current.forEach((video, itemId) => {
            if (!video.paused) {
              console.log('⏸️ Pausing video (carousel not active):', itemId);
              video.pause();
            }
          });
        }
      }, 200);
    }
  }, [isMuted, getCurrentVideo, getCurrentItem, getAllItems, getVisibleVideoIndices]);

  // Video state monitor - detects unexpected pauses
  useEffect(() => {
    if (!isActive) return;
    
    const monitorInterval = setInterval(() => {
      const currentVideo = getCurrentVideo();
      if (!currentVideo) return;
      
      const currentState = {
        paused: currentVideo.paused,
        time: Date.now()
      };
      
      // Check if video state changed without React knowing
      if (currentState.paused !== lastKnownVideoState.current.paused) {
        const timeSinceLastChange = currentState.time - lastKnownVideoState.current.time;
        
        if (currentState.paused && isPlaying) {
          console.log('🚨 UNEXPECTED PAUSE DETECTED:', {
            reactState: 'playing',
            videoState: 'paused',
            timeSinceLastChange,
            userPaused: userPausedRef.current,
            videoError: currentVideo.error?.message,
            networkState: currentVideo.networkState,
            readyState: currentVideo.readyState,
            src: currentVideo.src
          });
          // Sync React state to match video
          setIsPlaying(false);
        } else if (!currentState.paused && !isPlaying) {
          console.log('🚨 UNEXPECTED PLAY DETECTED:', {
            reactState: 'paused',
            videoState: 'playing',
            timeSinceLastChange,
            userPaused: userPausedRef.current
          });
          // Sync React state to match video
          setIsPlaying(true);
        }
      }
      
      lastKnownVideoState.current = currentState;
    }, 500); // Check every 500ms
    
    return () => clearInterval(monitorInterval);
  }, [isActive, isPlaying, getCurrentVideo]);

  // Effect to control video playback - debounced to prevent rapid changes
  useEffect(() => {
    // Increase delay to reduce race conditions and rapid state changes
    const timeoutId = setTimeout(() => {
      controlVideoPlayback();
    }, 200);
    
    return () => clearTimeout(timeoutId);
  }, [isActive, currentRemixIndex, isMuted, controlVideoPlayback]);

  // Effect to ensure proper mute state when becoming active
  useEffect(() => {
    if (isActive) {
      const currentVideo = getCurrentVideo();
      if (currentVideo) {
        // Restore user's mute preference when video becomes active
        currentVideo.muted = isMuted;
        console.log('🔊 Restored mute state for active video:', { isMuted, postId: getCurrentItem().post.id });
      }
    }
  }, [isActive, isMuted, getCurrentVideo, getCurrentItem]);

  // Load remix feed - only when becoming active for a new item
  useEffect(() => {
    if (isActive && remixFeed.length === 0 && !loadingRemixes && remixLoadingRef.current !== item.post.id) {
      console.log('🟧 HORIZONTAL: Loading remix feed for', item.post.id);
      remixLoadingRef.current = item.post.id;
      
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
          remixLoadingRef.current = null;
        }
      };
      
      loadRemixFeed();
    }
  }, [isActive, item.post.id, loadingRemixes, remixFeed.length]);

  // Sync refs with props/state (so watchDrag always has latest values)
  useEffect(() => {
    const wasActive = isActiveRef.current;
    isActiveRef.current = isActive;
    
    // When video becomes inactive, pause all videos and reset user pause state
    if (!isActive && wasActive) {
      console.log('🔄 Video became inactive, pausing all videos and resetting userPaused');
      
      // Use a small delay to avoid race conditions with other effects
      const timeoutId = setTimeout(() => {
        // Pause all videos in this carousel
        videoRefsMap.current.forEach((video, itemId) => {
          if (!video.paused) {
            console.log('⏸️ Force pausing video (became inactive):', itemId);
            video.pause();
          }
          // Also mute to prevent any audio bleeding through
          video.muted = true;
        });
        
        // Reset user pause state so videos auto-play when scrolled back to them
        if (userPausedRef.current) {
          console.log('🔄 Resetting userPaused state');
          userPausedRef.current = false;
        }
        
        // State will be synced by onPause events from individual videos
      }, 50); // Small delay to let other effects settle
      
      return () => clearTimeout(timeoutId);
    }
  }, [isActive]);

  // Additional safety effect - pause videos immediately when becoming inactive
  // REMOVED: This was causing race conditions with the main video control effect

  // Cleanup effect on unmount
  useEffect(() => {
    const currentVideoRefsMap = videoRefsMap.current;
    return () => {
      console.log('🔄 VideoCarousel unmounting, pausing all videos');
      currentVideoRefsMap.forEach((video) => {
        video.pause();
        video.muted = true;
      });
    };
  }, []);

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
    remixLoadingRef.current = null; // Clear remix loading tracker
    // isPlaying state will be synced by video events
    userPausedRef.current = false;
    hasUserInteractedRef.current = false;
    // Also reset showControls to ensure clean feed
    setShowControls(false);
    
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
  // Mobile detection removed - not currently used

  // Controls visibility - only show when user has interacted or explicitly paused
  useEffect(() => {
    // Only show controls if:
    // 1. Video is paused AND user has interacted, OR
    // 2. Video is paused due to user action (userPausedRef.current is true)
    const shouldShowControls = !isPlaying && (hasUserInteractedRef.current || userPausedRef.current);
    setShowControls(shouldShowControls);
    if (onControlsChange) {
      onControlsChange(shouldShowControls);
    }
  }, [isPlaying, onControlsChange]);

  // Preload next video when current video starts playing (using centralized manager)
  useEffect(() => {
    if (!nextItem || !isActive || !isPlaying) {
      // Cancel any existing preloads for this component when not active/playing
      if (preloadStartedRef.current) {
        videoPreloadManager.cancelPreload(preloadStartedRef.current);
        preloadStartedRef.current = null;
      }
      return;
    }

    const nextVideoUrl = nextItem.post.attachments[0]?.encodings?.md?.path || 
                        nextItem.post.attachments[0]?.encodings?.source?.path;
    
    if (!nextVideoUrl || preloadStartedRef.current === nextVideoUrl) {
      return; // Already preloading this video
    }

    // Request preload through centralized manager
    const success = videoPreloadManager.requestPreload({
      videoUrl: nextVideoUrl,
      postId: nextItem.post.id,
      priority: 1, // High priority for immediate next video
      onSuccess: () => {
        // setPreloadedVideoUrl removed
        preloadStartedRef.current = null;
      },
      onError: () => {
        preloadStartedRef.current = null;
      }
    });

    if (success) {
      preloadStartedRef.current = nextVideoUrl;
    }

    // Cleanup function
    return () => {
      if (preloadStartedRef.current) {
        videoPreloadManager.cancelPreload(preloadStartedRef.current);
        preloadStartedRef.current = null;
      }
    };
  }, [nextItem, isActive, isPlaying, item.post.id]);

  // Clean up preloads when component unmounts or item changes
  useEffect(() => {
    return () => {
      // Cancel any preloads for this post when component unmounts
      videoPreloadManager.cancelPreloadsForPost(item.post.id);
      preloadStartedRef.current = null;
      // setPreloadedVideoUrl removed
    };
  }, [item.post.id]);

  // Event handlers
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    const currentVideo = getCurrentVideo();
    if (!currentVideo) {
      console.log('🎬 Click: No current video');
      return;
    }
    
    // Check if video has errors
    if (currentVideo.error) {
      console.log('❌ Click ignored - video has error:', currentVideo.error.message);
      return;
    }
    
    // Check if video is ready
    if (currentVideo.readyState < 2) {
      console.log('🎬 Click ignored - video not ready');
      return;
    }
    
    // Prevent rapid clicks that can cause conflicts
    const now = Date.now();
    if (now - lastClickTime.current < 500) {
      console.log('🎬 Click ignored - too rapid');
      return;
    }
    lastClickTime.current = now;
    
    console.log('🎬 Video clicked', { 
      wasPaused: currentVideo.paused,
      userPausedBefore: userPausedRef.current,
      readyState: currentVideo.readyState,
      networkState: currentVideo.networkState
    });
    
    if (currentVideo.paused) {
      console.log('▶️ User clicked play');
      // Set user pause flag and play video - state will be synced by onPlay event
      userPausedRef.current = false;
      
      currentVideo.play().then(() => {
        console.log('▶️ Play successful');
      }).catch((err) => {
        console.log('▶️ Play failed:', err);
        // Only set userPausedRef on failure, let onPause event handle state
        userPausedRef.current = true;
      });
    } else {
      console.log('⏸️ User clicked pause');
      // Set user pause flag and pause video - state will be synced by onPause event
      userPausedRef.current = true;
      currentVideo.pause();
      console.log('⏸️ Pause initiated');
    }
    
    hasUserInteractedRef.current = true;
  }, [getCurrentVideo]);

  // Format filter helpers
  const getFormatFilterIcon = (filter: 'both' | 'tall' | 'wide') => {
    switch (filter) {
      case 'wide':
        return <Monitor className="w-5 h-5 text-white" />;
      case 'tall':
        return <Smartphone className="w-5 h-5 text-white" />;
      case 'both':
      default:
        return <Grid3X3 className="w-5 h-5 text-white" />;
    }
  };

  const handleFormatFilterClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onFormatFilterChange) return;
    
    const nextFilter = formatFilter === 'both' ? 'tall' : formatFilter === 'tall' ? 'wide' : 'both';
    onFormatFilterChange(nextFilter);
    hasUserInteractedRef.current = true;
  }, [formatFilter, onFormatFilterChange]);

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

  // Render video slide with virtualization
  const renderVideoSlide = useCallback((videoItem: SoraFeedItem, itemIndex: number) => {
    const { startIndex, endIndex } = getVisibleVideoIndices();
    const shouldRenderVideo = itemIndex >= startIndex && itemIndex <= endIndex;
    
    // Log virtualization decisions
    console.log('🎬 Video virtualization:', {
      itemId: videoItem.post.id,
      itemIndex,
      startIndex,
      endIndex,
      shouldRender: shouldRenderVideo
    });
    
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
            {shouldRenderVideo ? (
              <video
                ref={getVideoRef(videoItem.post.id)}
                src={videoUrl}
                className="object-contain block w-full h-full"
                style={{
                  width: videoWidth ? `${videoWidth}px` : 'auto',
                  height: videoWidth ? 'auto' : '100%',
                }}
                playsInline
                data-carousel-item={videoItem.post.id}
                onLoadedMetadata={(e) => {
                  handleVideoMetadata(e);
                  // Call custom feed event handler if provided
                  if (onCustomFeedVideoEvent) {
                    const video = e.currentTarget;
                    onCustomFeedVideoEvent('loadedmetadata', video.duration);
                  }
                }}
                onError={(e) => {
                  const video = e.currentTarget;
                  console.log('❌ Video error:', {
                    postId: videoItem.post.id,
                    error: video.error?.message,
                    code: video.error?.code,
                    networkState: video.networkState,
                    readyState: video.readyState,
                    src: videoUrl
                  });
                  // Reset playing state on error
                  setIsPlaying(false);
                // Don't set userPausedRef - let user try to play again
              }}
              onStalled={(e) => {
                console.log('⚠️ Video stalled:', {
                  postId: videoItem.post.id,
                  networkState: e.currentTarget.networkState,
                  readyState: e.currentTarget.readyState
                });
              }}
              onWaiting={(e) => {
                console.log('⏳ Video waiting for data:', {
                  postId: videoItem.post.id,
                  networkState: e.currentTarget.networkState,
                  readyState: e.currentTarget.readyState
                });
              }}
              onPlay={(e) => {
                console.log('▶️ VIDEO PLAY EVENT:', {
                  postId: videoItem.post.id,
                  isActive,
                  currentTime: e.currentTarget.currentTime.toFixed(1)
                });
                // Sync React state when video actually starts playing
                if (videoItem.post.id === getCurrentItem().post.id) {
                  setIsPlaying(true);
                }
              }}
              onPause={(e) => {
                console.log('⏸️ VIDEO PAUSE EVENT:', {
                  postId: videoItem.post.id,
                  isActive,
                  currentTime: e.currentTarget.currentTime.toFixed(1),
                  reason: userPausedRef.current ? 'user' : 'automatic'
                });
                
                // Capture stack trace to see what caused the pause
                if (!userPausedRef.current) {
                  console.log('📍 AUTOMATIC PAUSE STACK TRACE:', new Error().stack);
                }
                
                // Sync React state when video actually pauses
                if (videoItem.post.id === getCurrentItem().post.id) {
                  setIsPlaying(false);
                }
              }}
              onEnded={() => {
                console.log('🎬 Video ended:', {
                  postId: videoItem.post.id,
                  isActive,
                  hasOnNext: !!onNext,
                  currentTime: new Date().toISOString()
                });
                
                // Call custom feed event handler if provided
                if (onCustomFeedVideoEvent) {
                  onCustomFeedVideoEvent('ended');
                }
                
                if (isActive && onNext) {
                  console.log('🎬 Video ended, auto-progressing to next video');
                  onNext();
                } else {
                  console.log('🎬 Video ended but not auto-progressing:', {
                    reason: !isActive ? 'not active' : 'no onNext handler'
                  });
                }
              }}
              preload="auto"
            >
              <source src={videoUrl} type="video/mp4" />
            </video>
            ) : (
              // Placeholder for non-rendered videos
              <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                <div className="text-white/50 text-sm">Video {itemIndex + 1}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [videoWidth, isActive, getVideoRef, handleVideoMetadata, onNext, onCustomFeedVideoEvent, getVisibleVideoIndices, getCurrentItem]);

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
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
      >
        <div className="h-full" ref={emblaRef}>
          <div className="flex h-full">
            {allItems.map((videoItem, index) => renderVideoSlide(videoItem, index))}
          </div>
        </div>
      </div>
      
      {/* Controls Overlay */}
      <>
        {/* Play/Pause Button - Upper Left Corner - Controlled by showControls */}
        <div 
          className="absolute top-4 z-30"
          style={{ 
            left: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
            opacity: showControls ? 1 : 0,
            transform: showControls ? 'translateX(0)' : 'translateX(-20px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: showControls ? 'auto' : 'none'
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

              {/* Format Filter Button */}
              {onFormatFilterChange && (
                <button
                  onClick={handleFormatFilterClick}
                  className="bg-black/50 rounded-full p-2 hover:bg-black/70 transition-all cursor-pointer"
                  title={`Format: ${formatFilter === 'both' ? 'All' : formatFilter === 'tall' ? 'Portrait' : 'Landscape'}`}
                >
                  {getFormatFilterIcon(formatFilter)}
                </button>
              )}
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
            {(() => {
              const displayName = currentItem.profile.display_name;
              const username = currentItem.profile.username;
              const finalName = displayName || username || 'Sora User';
              
              // 🔍 USERNAME LOGGING: Log username rendering decision in VideoCarousel
              console.log('👤 VideoCarousel rendering username:', {
                postId: currentItem.post.id,
                displayName,
                username,
                finalName,
                fallbackUsed: finalName === 'Sora User'
              });
              
              return finalName;
            })()}
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
      
      {/* Remix Navigation - positioned at very bottom center of video - Controlled by showControls */}
      {hasRemixes && (
        <div 
          className="absolute bottom-4 z-40"
          style={{ 
            left: '50%',
            transform: showControls ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
            opacity: showControls ? 1 : 0,
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: showControls ? 'auto' : 'none'
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
