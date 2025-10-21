'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { Play, Pause, Volume2, VolumeX, Heart, User, CheckCircle, ChevronLeft, ChevronRight, Download, Facebook, Twitter } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import { remixCache } from '@/lib/remixCache';

interface VideoPostProps {
  item: SoraFeedItem;
  isActive: boolean;
  isUpcoming?: boolean;
  isTargetVideo?: boolean;
  scrollDirection?: 'up' | 'down' | null;
  onNext: () => void;
  onPrevious: () => void;
  onAddToFavorites?: (item: SoraFeedItem) => void;
  onRemoveFromFavorites?: (postId: string) => void;
  isInFavorites?: (postId: string) => boolean;
  onRemixStatusChange?: (hasRemixes: boolean) => void;
  onKeyboardNavigation?: (direction: 'left' | 'right') => void;
  preloadedRemixFeed?: SoraFeedItem[];
  onControlsChange?: (showing: boolean) => void;
}

// Unified Video Management System
interface VideoElement {
  ref: React.RefObject<HTMLVideoElement | null>;
  position: { x: number; y: number }; // Relative position (0,0 = center)
  item: SoraFeedItem;
  isActive: boolean;
  isTarget: boolean; // Target during scroll transition
  shouldPlay: boolean;
  shouldMute: boolean;
}

export default function VideoPost({ 
  item, 
  isActive, 
  isUpcoming: _isUpcoming, // Keep for interface compatibility but mark as unused
  isTargetVideo: _isTargetVideo, // Keep for interface compatibility but mark as unused
  scrollDirection: _scrollDirection, // Keep for interface compatibility but mark as unused
  onNext: _onNext, // Keep for interface compatibility but mark as unused
  onAddToFavorites, 
  onRemoveFromFavorites, 
  isInFavorites, 
  onRemixStatusChange, 
  onKeyboardNavigation: _onKeyboardNavigation, // Keep for interface compatibility but mark as unused
  preloadedRemixFeed, 
  onControlsChange 
}: VideoPostProps) {
  
  // ===== UNIFIED STATE MANAGEMENT =====
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [leftVideoReady, setLeftVideoReady] = useState(false);
  const [rightVideoReady, setRightVideoReady] = useState(false);
  
  // Remix state
  const [remixFeed, setRemixFeed] = useState<SoraFeedItem[]>([]);
  const [currentRemixIndex, setCurrentRemixIndex] = useState(0);
  const [loadingRemixes, setLoadingRemixes] = useState(false);
  
  // Unified scroll state
  const [scrollState, setScrollState] = useState<{
    direction: 'up' | 'down' | 'left' | 'right' | null;
    targetIndex: number | null;
    isScrolling: boolean;
  }>({
    direction: null,
    targetIndex: null,
    isScrolling: false
  });
  
  // Motion values for both directions
  const x = useMotionValue(0);
  
  // Video refs - use a Map to track videos by item ID for stable references
  const videoRefsMap = useRef<Map<string, HTMLVideoElement>>(new Map());
  
  // Legacy refs for compatibility with existing code
  const centerVideoRef = useRef<HTMLVideoElement>(null);
  const leftVideoRef = useRef<HTMLVideoElement>(null);
  const rightVideoRef = useRef<HTMLVideoElement>(null);
  const upVideoRef = useRef<HTMLVideoElement>(null);
  const downVideoRef = useRef<HTMLVideoElement>(null);
  
  // Helper to get or create video ref for an item
  const getVideoRefForItem = useCallback((itemId: string, position: 'left' | 'center' | 'right') => {
    return (el: HTMLVideoElement | null) => {
      if (el) {
        videoRefsMap.current.set(itemId, el);
        // Also update position-based refs for backward compatibility
        if (position === 'center') centerVideoRef.current = el;
        else if (position === 'left') leftVideoRef.current = el;
        else if (position === 'right') rightVideoRef.current = el;
      }
    };
  }, []);
  
  // Control refs
  const userPausedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const lastInteractionRef = useRef<number>(Date.now());
  
  // ===== UNIFIED VIDEO MANAGEMENT =====
  
  // Get all available items (original + remixes)
  const getAllItems = useCallback((): SoraFeedItem[] => {
    return [item, ...remixFeed];
  }, [item, remixFeed]);
  
  // Get current item based on remix index
  const getCurrentItem = useCallback((): SoraFeedItem => {
    const allItems = getAllItems();
    return allItems[currentRemixIndex] || item;
  }, [currentRemixIndex, getAllItems, item]);
  
  // Create video element grid
  const createVideoGrid = useCallback((): VideoElement[] => {
    const allItems = getAllItems();
    const grid: VideoElement[] = [];
    
    // During horizontal scrolling, keep center video playing until navigation completes
    // This matches the behavior of up/down scrolling where videos keep playing during transition
    const centerShouldPlay = isActive && !userPausedRef.current;
    
    // Center video (current)
    grid.push({
      ref: centerVideoRef,
      position: { x: 0, y: 0 },
      item: getCurrentItem(),
      isActive: isActive,
      isTarget: false,
      shouldPlay: centerShouldPlay,
      shouldMute: isMuted || !isActive
    });
    
    // Left video (previous remix)
    if (currentRemixIndex > 0) {
      const leftItem = allItems[currentRemixIndex - 1];
      grid.push({
        ref: leftVideoRef,
        position: { x: -1, y: 0 },
        item: leftItem,
        isActive: false,
        isTarget: scrollState.direction === 'left' && scrollState.targetIndex === currentRemixIndex - 1,
        shouldPlay: false, // Adjacent videos stay paused, matching up/down behavior
        shouldMute: true
      });
    }
    
    // Right video (next remix)
    if (currentRemixIndex < allItems.length - 1) {
      const rightItem = allItems[currentRemixIndex + 1];
      grid.push({
        ref: rightVideoRef,
        position: { x: 1, y: 0 },
        item: rightItem,
        isActive: false,
        isTarget: scrollState.direction === 'right' && scrollState.targetIndex === currentRemixIndex + 1,
        shouldPlay: false, // Adjacent videos stay paused, matching up/down behavior
        shouldMute: true
      });
    }
    
    return grid;
  }, [getAllItems, getCurrentItem, currentRemixIndex, isActive, scrollState, isMuted]);
  
  // ===== UNIFIED VIDEO CONTROL =====
  
  // Control all videos based on grid state
  const controlAllVideos = useCallback(() => {
    const grid = createVideoGrid();
    
    grid.forEach(videoElement => {
      const video = videoElement.ref.current;
    if (!video) return;

      // Set mute state
      video.muted = videoElement.shouldMute;
      
      // Control playback
      if (videoElement.shouldPlay && video.paused) {
        console.log(`▶️ Playing video at position (${videoElement.position.x}, ${videoElement.position.y})`);
        video.play().catch(err => console.log('❌ Play failed:', err));
      } else if (!videoElement.shouldPlay && !video.paused) {
        console.log(`⏸️ Pausing video at position (${videoElement.position.x}, ${videoElement.position.y})`);
        video.pause();
      }
    });
    
    // Update React state based on center video
    const centerVideo = centerVideoRef.current;
    if (centerVideo) {
      setIsPlaying(!centerVideo.paused);
    }
  }, [createVideoGrid]);
  
  // ===== SCROLL DETECTION =====
  
  // Note: Scroll detection is now handled directly in the drag handler
  // This prevents conflicts between motion value listeners and drag events
  
  // ===== UNIFIED VIDEO CONTROL EFFECT =====
  
  // Single effect to control all videos
  useEffect(() => {
    if (!isActive) {
      // Pause and mute all videos when inactive
      [centerVideoRef, leftVideoRef, rightVideoRef, upVideoRef, downVideoRef].forEach(ref => {
        const video = ref.current;
        if (video) {
          video.pause();
          video.muted = true;
        }
      });
    setIsPlaying(false);
      return;
    }
    
    // Control videos based on current state
    controlAllVideos();
  }, [isActive, scrollState, currentRemixIndex, isMuted, controlAllVideos]);
  
  // ===== NAVIGATION FUNCTIONS =====
  
  // Unified navigation with smooth animation matching main feed
  const navigateToRemix = useCallback((targetIndex: number, animated = true) => {
    if (targetIndex < 0 || targetIndex >= getAllItems().length) return;
    
    if (animated) {
      // Use the same smooth spring animation as main feed
      const direction = targetIndex > currentRemixIndex ? -1 : 1;
      animate(x, direction * window.innerWidth, {
        type: 'spring',
        stiffness: 400, // Match main feed animation
        damping: 40,    // Match main feed animation
        onComplete: () => {
          // Update index and reset position immediately to prevent visual glitches
          setCurrentRemixIndex(targetIndex);
          x.set(0);
          setScrollState({ direction: null, targetIndex: null, isScrolling: false });
          // Don't reset video ready states - let videos remain ready for smoother transitions
        }
      });
    } else {
      // Immediate change (for manual drag completion)
      setCurrentRemixIndex(targetIndex);
      x.set(0);
      setScrollState({ direction: null, targetIndex: null, isScrolling: false });
    }
  }, [currentRemixIndex, getAllItems, x]);
  
  const goToNextRemix = useCallback((animated = true) => {
    navigateToRemix(currentRemixIndex + 1, animated);
  }, [currentRemixIndex, navigateToRemix]);
  
  const goToPreviousRemix = useCallback((animated = true) => {
    navigateToRemix(currentRemixIndex - 1, animated);
  }, [currentRemixIndex, navigateToRemix]);
  
  const goToRemixIndex = useCallback((index: number) => {
    navigateToRemix(index, true);
  }, [navigateToRemix]);
  
  // ===== USER INTERACTION HANDLERS =====
  
  // Unified click handler
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    const centerVideo = centerVideoRef.current;
    if (!centerVideo) return;
    
    const actuallyPlaying = !centerVideo.paused;
    console.log('🖱️ Video clicked:', { 
      currentRemixIndex, 
      actuallyPlaying, 
      reactIsPlaying: isPlaying 
    });
    
    if (actuallyPlaying) {
      centerVideo.pause();
      setIsPlaying(false);
      userPausedRef.current = true;
    } else {
      centerVideo.play().then(() => {
        setIsPlaying(true);
        userPausedRef.current = false;
      }).catch(() => {
        setIsPlaying(false);
      });
    }
    
        handleInteraction();
  }, [currentRemixIndex, isPlaying, handleInteraction]);
  
  // Interaction tracking
  const handleInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    hasUserInteractedRef.current = true;
  }, []);
  
  // Mouse handlers
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);
  
  // ===== DRAG HANDLERS =====
  
  // Unified drag handler with immediate navigation on threshold
  const bind = useDrag(
    ({ down, movement: [mx], velocity: [vx], first, last }) => {
      // Don't process drag if we're in the middle of an animation
      if (scrollState.isScrolling && !down) return;
      
      if (first) {
        // Start of drag - clear any existing scroll state
        setScrollState({
          direction: null,
          targetIndex: null,
          isScrolling: false
        });
      }
      
      if (down) {
        // While dragging, update position smoothly
        x.set(mx);
        
        // Immediate navigation threshold - commit to next video once user drags far enough
        const commitThreshold = window.innerWidth * 0.25; // 25% of screen width
        
        if (Math.abs(mx) > commitThreshold) {
          if (mx < -commitThreshold && currentRemixIndex < getAllItems().length - 1) {
            // User has committed to next remix - navigate immediately
            console.log('🎬 Drag commit: Navigating to next remix');
            setScrollState({
              direction: 'right',
              targetIndex: currentRemixIndex + 1,
              isScrolling: true
            });
            // Animate to complete the transition
            animate(x, -window.innerWidth, {
              type: 'spring',
              stiffness: 400,
              damping: 40,
              onComplete: () => {
                goToNextRemix(false);
                setScrollState({
                  direction: null,
                  targetIndex: null,
                  isScrolling: false
                });
              }
            });
          } else if (mx > commitThreshold && currentRemixIndex > 0) {
            // User has committed to previous remix - navigate immediately
            console.log('🎬 Drag commit: Navigating to previous remix');
            setScrollState({
              direction: 'left',
              targetIndex: currentRemixIndex - 1,
              isScrolling: true
            });
            // Animate to complete the transition
            animate(x, window.innerWidth, {
              type: 'spring',
              stiffness: 400,
              damping: 40,
              onComplete: () => {
                goToPreviousRemix(false);
                setScrollState({
                  direction: null,
                  targetIndex: null,
                  isScrolling: false
                });
              }
            });
          }
        } else {
          // Still in preview mode - update scroll state for video control
          const previewThreshold = 50;
          if (Math.abs(mx) > previewThreshold) {
            if (mx < -previewThreshold && currentRemixIndex < getAllItems().length - 1) {
              // Previewing next remix
              setScrollState({
                direction: 'right',
                targetIndex: currentRemixIndex + 1,
                isScrolling: true
              });
            } else if (mx > previewThreshold && currentRemixIndex > 0) {
              // Previewing previous remix
              setScrollState({
                direction: 'left',
                targetIndex: currentRemixIndex - 1,
                isScrolling: true
              });
            }
          } else {
            // Reset scroll state when close to center
            setScrollState({
              direction: null,
              targetIndex: null,
              isScrolling: false
            });
          }
        }
      } else if (last) {
        // Released - if we haven't already committed, decide based on position and velocity
        if (!scrollState.isScrolling) {
          const threshold = window.innerWidth * 0.15; // Lower threshold for release
          const shouldNavigate = Math.abs(mx) > threshold || Math.abs(vx) > 0.3;

          if (shouldNavigate) {
            if (mx < 0 && currentRemixIndex < getAllItems().length - 1) {
              // Swiped left - navigate to next
              console.log('🎬 Drag release: Going to next remix');
              setScrollState({
                direction: 'right',
                targetIndex: currentRemixIndex + 1,
                isScrolling: true
              });
              animate(x, -window.innerWidth, {
                type: 'spring',
                stiffness: 400,
                damping: 40,
                onComplete: () => {
                  goToNextRemix(false);
                  setScrollState({
                    direction: null,
                    targetIndex: null,
                    isScrolling: false
                  });
                }
              });
            } else if (mx > 0 && currentRemixIndex > 0) {
              // Swiped right - navigate to previous
              console.log('🎬 Drag release: Going to previous remix');
              setScrollState({
                direction: 'left',
                targetIndex: currentRemixIndex - 1,
                isScrolling: true
              });
              animate(x, window.innerWidth, {
                type: 'spring',
                stiffness: 400,
                damping: 40,
                onComplete: () => {
                  goToPreviousRemix(false);
                  setScrollState({
                    direction: null,
                    targetIndex: null,
                    isScrolling: false
                  });
                }
              });
            } else {
              // Snap back to position if can't navigate
              console.log('🎬 Drag release: Snapping back (boundary hit)');
              animate(x, 0, {
                type: 'spring',
                stiffness: 300,
                damping: 30,
                onComplete: () => {
                  setScrollState({
                    direction: null,
                    targetIndex: null,
                    isScrolling: false
                  });
                }
              });
            }
          } else {
            // Snap back to position
            console.log('🎬 Drag release: Snapping back (insufficient movement)');
            animate(x, 0, {
              type: 'spring',
              stiffness: 300,
              damping: 30,
              onComplete: () => {
                setScrollState({
                  direction: null,
                  targetIndex: null,
                  isScrolling: false
                });
              }
            });
          }
        }
        // If we already committed during drag, the animation is already running
      }
    },
    {
      axis: 'x',
      // Remove restrictive bounds - let the drag handler manage boundaries
      rubberband: true,
      // Add some configuration to make dragging more responsive
      filterTaps: true,
      threshold: 10
    }
  );
  
  // ===== KEYBOARD NAVIGATION =====
  
  // Handle keyboard navigation for remixes (matching main feed pattern)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive || scrollState.isScrolling) return;
      
      // Don't trigger navigation if user is typing in an input field
      const activeElement = document.activeElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).isContentEditable
      );
      
      if (isTyping) return;
      
      if (e.key === 'ArrowLeft' && currentRemixIndex > 0) {
        e.preventDefault();
        console.log('⌨️ Keyboard: Going to previous remix');
        setScrollState({
          direction: 'left',
          targetIndex: currentRemixIndex - 1,
          isScrolling: true
        });
        goToPreviousRemix(true); // Use animated navigation
        // Reset scroll state after animation completes
        setTimeout(() => {
          setScrollState({
            direction: null,
            targetIndex: null,
            isScrolling: false
          });
        }, 600);
      } else if (e.key === 'ArrowRight' && currentRemixIndex < getAllItems().length - 1) {
        e.preventDefault();
        console.log('⌨️ Keyboard: Going to next remix');
        setScrollState({
          direction: 'right',
          targetIndex: currentRemixIndex + 1,
          isScrolling: true
        });
        goToNextRemix(true); // Use animated navigation
        // Reset scroll state after animation completes
        setTimeout(() => {
          setScrollState({
            direction: null,
            targetIndex: null,
            isScrolling: false
          });
        }, 600);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, scrollState.isScrolling, currentRemixIndex, getAllItems, goToPreviousRemix, goToNextRemix]);
  
  // ===== INITIALIZATION EFFECTS =====
  
  // Load remix feed
  useEffect(() => {
    if (isActive && remixFeed.length === 0 && !loadingRemixes) {
      if (preloadedRemixFeed && preloadedRemixFeed.length > 0) {
        setRemixFeed(preloadedRemixFeed);
      } else {
        // Load remix feed
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
    }
  }, [isActive, remixFeed.length, loadingRemixes, preloadedRemixFeed, item.post.id]);
  
  // Reset state when item changes
  useEffect(() => {
    console.log('🔄 Video item changed:', item.post.id);
    
    // Cleanup all videos
    [centerVideoRef, leftVideoRef, rightVideoRef, upVideoRef, downVideoRef].forEach(ref => {
      const video = ref.current;
      if (video) {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
      }
    });
    
    // Reset state
    setRemixFeed([]);
    setCurrentRemixIndex(0);
    setLoadingRemixes(false);
    setVideoReady(false);
    setLeftVideoReady(false);
    setRightVideoReady(false);
    setIsPlaying(false);
    setScrollState({ direction: null, targetIndex: null, isScrolling: false });
    x.set(0);
    userPausedRef.current = false;
    hasUserInteractedRef.current = false;
  }, [item.post.id, x]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 VideoPost unmounting - cleaning up all videos');
      [centerVideoRef, leftVideoRef, rightVideoRef, upVideoRef, downVideoRef].forEach(ref => {
        const video = ref.current;
        if (video) {
          video.pause();
          video.muted = true;
          video.currentTime = 0;
        }
      });
    };
  }, []);
  
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
  
  // Notify remix status
  useEffect(() => {
    if (onRemixStatusChange) {
      onRemixStatusChange(remixFeed.length > 0);
    }
  }, [remixFeed.length, onRemixStatusChange]);
  
  // ===== HELPER FUNCTIONS =====
  
  const currentItem = getCurrentItem();
  const hasRemixes = remixFeed.length > 0;
  const canGoLeft = currentRemixIndex > 0;
  const canGoRight = currentRemixIndex < getAllItems().length - 1;
  
  // Video event handlers
  const handleVideoLoad = useCallback((video: HTMLVideoElement) => {
    if (video.readyState >= 2) {
      setVideoReady(true);
    }
  }, []);
  
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
  
  const handleVideoCanPlay = useCallback((video: HTMLVideoElement) => {
    setVideoReady(true);
    handleVideoLoad(video);
  }, [handleVideoLoad]);

  const handleLeftVideoCanPlay = useCallback(() => {
    setLeftVideoReady(true);
  }, []);

  const handleRightVideoCanPlay = useCallback(() => {
    setRightVideoReady(true);
  }, []);
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    const video = centerVideoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);
  
  // ===== RENDER =====
  
  // Render video elements with stable keys based on item ID to prevent reloading when positions change
  const renderVideoAtPosition = useCallback((itemIndex: number, position: 'left' | 'center' | 'right') => {
    const items = getAllItems();
    if (itemIndex < 0 || itemIndex >= items.length) return null;
    
    const videoItem = items[itemIndex];
    const videoUrl = videoItem.post.attachments[0]?.encodings?.md?.path || 
                     videoItem.post.attachments[0]?.encodings?.source?.path;
    
    if (!videoUrl) return null;
    
    const isCenter = position === 'center';
    const isLeft = position === 'left';
    const isRight = position === 'right';
    
    // Use position for transform, but item ID as key for stable element identity
    const transform = isLeft ? 'translateX(-100%)' : isRight ? 'translateX(100%)' : 'translateX(0)';
    const zIndex = isCenter ? 20 : 10;
    
    // Determine if video is ready based on position
    let isReady = false;
    if (isCenter) isReady = videoReady;
    else if (isLeft) isReady = leftVideoReady;
    else if (isRight) isReady = rightVideoReady;
    
    return (
      <div 
        key={videoItem.post.id}
        className="absolute inset-0 w-full h-full flex items-center justify-center"
        style={{ 
          transform,
          zIndex
        }}
      >
        {isCenter ? (
          <div className="relative h-full w-full flex items-center justify-center">
            <div 
              className="relative h-full flex items-center justify-center"
              style={{ 
                width: videoWidth ? `${videoWidth}px` : '100%',
                maxWidth: '100%'
              }}
            >
              <video
                ref={getVideoRefForItem(videoItem.post.id, position)}
                src={videoUrl}
                className="object-contain block"
                style={{
                  width: videoWidth ? `${videoWidth}px` : 'auto',
                  height: videoWidth ? 'auto' : '100%',
                  opacity: isReady ? 1 : 0,
                  transition: 'opacity 0.3s ease-in-out'
                }}
                muted={isMuted}
                playsInline
                loop
                onLoadedMetadata={handleVideoMetadata}
                onCanPlay={(e) => handleVideoCanPlay(e.currentTarget)}
                onLoadedData={(e) => handleVideoLoad(e.currentTarget)}
                preload="auto"
              >
                <source src={videoUrl} type="video/mp4" />
              </video>
            </div>
          </div>
        ) : (
          <video
            ref={getVideoRefForItem(videoItem.post.id, position)}
            src={videoUrl}
            className="h-full w-auto max-w-full object-contain"
            style={{
              opacity: isReady ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out'
            }}
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={(e) => {
              if (isLeft) handleLeftVideoCanPlay(e.currentTarget);
              else handleRightVideoCanPlay(e.currentTarget);
            }}
            onLoadedData={(e) => {
              if (isLeft) handleLeftVideoCanPlay(e.currentTarget);
              else handleRightVideoCanPlay(e.currentTarget);
            }}
          />
        )}
      </div>
    );
  }, [getAllItems, videoWidth, videoReady, leftVideoReady, rightVideoReady, isMuted, 
      getVideoRefForItem, handleVideoMetadata, handleVideoCanPlay, handleVideoLoad, 
      handleLeftVideoCanPlay, handleRightVideoCanPlay]);

    return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Video Container */}
        <motion.div
          {...(bind() as Record<string, unknown>)}
          style={{ x }}
          className="absolute inset-0 flex items-center justify-center group cursor-pointer select-none"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleVideoClick}
      >
        {/* Render videos at their positions with stable keys */}
        {canGoLeft && renderVideoAtPosition(currentRemixIndex - 1, 'left')}
        {renderVideoAtPosition(currentRemixIndex, 'center')}
        {canGoRight && renderVideoAtPosition(currentRemixIndex + 1, 'right')}
      </motion.div>
      
      {/* Controls Overlay */}
      {videoReady && (
        <>
          {/* Play/Pause Button - Upper Left Corner - Always Visible */}
          {videoReady && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute top-4 z-30"
              style={{ 
                left: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
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
            </motion.div>
          )}
          
        </>
      )}
      
      {/* Description and Username - positioned as overlay above remix indicator */}
      {videoReady && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: showControls ? 1 : 0,
            y: showControls ? 0 : 20
          }}
          className="absolute bottom-20 z-40 max-w-xs"
          style={{ 
            left: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
            pointerEvents: showControls ? 'auto' : 'none' 
          }}
        >
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
                      className="text-white/80 hover:text-white text-xs font-semibold mt-1 cursor-pointer"
                    >
                  {isDescriptionExpanded ? 'less' : 'more'}
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}
      
      {/* Remix Navigation - positioned at very bottom center of video - Always Visible */}
      {videoReady && hasRemixes && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: 1,
            y: 0
          }}
          className="absolute bottom-4 z-40"
          style={{ 
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'auto'
          }}
        >
          <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
            {/* Previous Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('🔘 Button: Going to previous remix');
                      goToPreviousRemix();
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
                const allItems = getAllItems();
                const totalItems = allItems.length;
                
                // If 10 or fewer items, show all dots
                if (totalItems <= 10) {
                  return allItems.map((_, index) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        goToRemixIndex(index);
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
                          goToRemixIndex(i);
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
                      console.log('🔘 Button: Going to next remix');
                      goToNextRemix();
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
        </motion.div>
      )}
      
      {/* Action Menu - positioned at bottom right corner of video */}
      {videoReady && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ 
            opacity: showControls ? 1 : 0,
            x: showControls ? 0 : 20
          }}
          className="absolute bottom-4 z-40"
          style={{ 
            right: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
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
        </motion.div>
      )}
      </div>
  );
}