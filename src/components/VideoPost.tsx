'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { Play, Pause, Volume2, VolumeX, Heart, User, CheckCircle, ChevronLeft, ChevronRight, Download, Facebook, Twitter, Monitor, Smartphone, Grid3X3 } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
// Remix cache removed - feature no longer used
import { videoPreloadManager } from '@/lib/videoPreloadManager';

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
  formatFilter?: 'both' | 'tall' | 'wide';
  onFormatFilterChange?: (filter: 'both' | 'tall' | 'wide') => void;
  nextItem?: SoraFeedItem; // For preloading the next video
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
  onNext, // Keep for auto-scroll functionality
  onAddToFavorites, 
  onRemoveFromFavorites, 
  isInFavorites, 
  onRemixStatusChange, 
  preloadedRemixFeed, 
  onControlsChange,
  formatFilter = 'both',
  onFormatFilterChange,
  nextItem
}: VideoPostProps) {
  
  // 🔍 USERNAME LOGGING: Log initial item data
  console.log('🎬 VideoPost received item:', {
    postId: item.post.id,
    username: item.profile.username,
    displayName: item.profile.display_name,
    userId: item.profile.user_id,
    fullProfile: item.profile
  });
  
  // ===== UNIFIED STATE MANAGEMENT =====
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [leftVideoReady, setLeftVideoReady] = useState(false);
  const [rightVideoReady, setRightVideoReady] = useState(false);
  
  // Video state monitoring
  const lastKnownVideoState = useRef<{paused: boolean, time: number}>({paused: true, time: 0});
  
  // Preloading state
  const preloadStartedRef = useRef<string | null>(null);
  
  // Track remix loading to prevent duplicates
  const remixLoadingRef = useRef<string | null>(null);
  
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
  // const _y = useMotionValue(0); // For potential future vertical remix scrolling
  
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
  // const _isFirstVideoRef = useRef(true); // Keep for potential future use
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
    const currentItem = allItems[currentRemixIndex] || item;
    
    // 🔍 USERNAME LOGGING: Log current item being displayed
    console.log('🎯 getCurrentItem returning:', {
      postId: currentItem.post.id,
      username: currentItem.profile.username,
      displayName: currentItem.profile.display_name,
      remixIndex: currentRemixIndex,
      isOriginalItem: currentRemixIndex === 0
    });
    
    return currentItem;
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
      if (videoElement.shouldPlay && video.paused && !video.ended) {
        console.log(`▶️ Playing video at position (${videoElement.position.x}, ${videoElement.position.y})`, {
          videoId: videoElement.item.post.id,
          currentTime: video.currentTime,
          duration: video.duration,
          ended: video.ended
        });
        video.play().catch(err => console.log('❌ Play failed:', err));
      } else if (!videoElement.shouldPlay && !video.paused) {
        console.log(`⏸️ Pausing video at position (${videoElement.position.x}, ${videoElement.position.y})`, {
          videoId: videoElement.item.post.id,
          currentTime: video.currentTime,
          duration: video.duration,
          ended: video.ended
        });
        video.pause();
      } else if (video.ended) {
        console.log(`🏁 Video ended at position (${videoElement.position.x}, ${videoElement.position.y}) - not restarting`, {
          videoId: videoElement.item.post.id,
          currentTime: video.currentTime,
          duration: video.duration,
          ended: video.ended
        });
      }
    });
    
    // Note: React state is now synced via video event listeners (onPlay/onPause)
    // This prevents race conditions between user actions and automatic state updates
  }, [createVideoGrid]);
  
  // ===== SCROLL DETECTION =====
  
  // Note: Scroll detection is now handled directly in the drag handler
  // This prevents conflicts between motion value listeners and drag events
  
  // ===== UNIFIED VIDEO CONTROL EFFECT =====
  
  // Video state monitor - detects unexpected pauses
  useEffect(() => {
    if (!isActive) return;
    
    const monitorInterval = setInterval(() => {
      const centerVideo = centerVideoRef.current;
      if (!centerVideo) return;
      
      const currentState = {
        paused: centerVideo.paused,
        time: Date.now()
      };
      
      // Check if video state changed without React knowing
      if (currentState.paused !== lastKnownVideoState.current.paused) {
        const timeSinceLastChange = currentState.time - lastKnownVideoState.current.time;
        
        if (currentState.paused && isPlaying) {
          console.log('🚨 UNEXPECTED PAUSE DETECTED (VideoPost):', {
            reactState: 'playing',
            videoState: 'paused',
            timeSinceLastChange,
            userPaused: userPausedRef.current,
            videoError: centerVideo.error?.message,
            networkState: centerVideo.networkState,
            readyState: centerVideo.readyState,
            currentRemixIndex,
            src: centerVideo.src
          });
          // Sync React state to match video
          setIsPlaying(false);
        } else if (!currentState.paused && !isPlaying) {
          console.log('🚨 UNEXPECTED PLAY DETECTED (VideoPost):', {
            reactState: 'paused',
            videoState: 'playing',
            timeSinceLastChange,
            userPaused: userPausedRef.current,
            currentRemixIndex
          });
          // Sync React state to match video
          setIsPlaying(true);
        }
      }
      
      lastKnownVideoState.current = currentState;
    }, 500); // Check every 500ms
    
    return () => clearInterval(monitorInterval);
  }, [isActive, isPlaying, currentRemixIndex]);

  // Single effect to control all videos - with improved race condition handling
  useEffect(() => {
    if (!isActive) {
      // Add delay before pausing to prevent pausing during quick transitions
      const pauseTimeoutId = setTimeout(() => {
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
        }
      }, 150);
      
      return () => clearTimeout(pauseTimeoutId);
    }
    
    // Add a longer delay to ensure all state updates have settled and avoid conflicts with user actions
    const timeoutId = setTimeout(() => {
      controlAllVideos();
    }, 200);
    
    return () => clearTimeout(timeoutId);
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
  
  // Interaction tracking
  const handleInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    hasUserInteractedRef.current = true;
  }, []);
  
  // Unified click handler with improved error handling
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    const centerVideo = centerVideoRef.current;
    if (!centerVideo) {
      console.log('🖱️ Click ignored - no center video');
      return;
    }
    
    // Check if video has errors
    if (centerVideo.error) {
      console.log('❌ Click ignored - video has error:', centerVideo.error.message);
      return;
    }
    
    // Check if video is ready
    if (centerVideo.readyState < 2) {
      console.log('🖱️ Click ignored - video not ready');
      return;
    }
    
    // Prevent rapid clicks
    const now = Date.now();
    const timeSinceLastInteraction = now - lastInteractionRef.current;
    if (timeSinceLastInteraction < 500) {
      console.log('🖱️ Click ignored - too rapid');
      return;
    }
    
    const actuallyPlaying = !centerVideo.paused;
    console.log('🖱️ Video clicked:', { 
      currentRemixIndex, 
      actuallyPlaying, 
      reactIsPlaying: isPlaying,
      readyState: centerVideo.readyState,
      networkState: centerVideo.networkState
    });
    
    if (actuallyPlaying) {
      // Set user pause flag and pause video - state will be synced by onPause event
      userPausedRef.current = true;
      centerVideo.pause();
      console.log('⏸️ VideoPost pause initiated');
    } else {
      // Set user pause flag and play video - state will be synced by onPlay event
      userPausedRef.current = false;
      centerVideo.play().then(() => {
        console.log('✅ VideoPost play successful');
      }).catch((err) => {
        console.log('❌ VideoPost play failed:', err);
        // Only set userPausedRef on failure, let onPause event handle state
        userPausedRef.current = true;
      });
    }
    
    handleInteraction();
  }, [currentRemixIndex, isPlaying, handleInteraction]);
  
  // Mouse handlers - removed unused hover state
  const handleMouseEnter = useCallback(() => {
    // Hover state removed - not currently used
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    // Hover state removed - not currently used
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
  
  // Load remix feed - only when becoming active for a new item
  useEffect(() => {
    if (isActive && remixFeed.length === 0 && !loadingRemixes && remixLoadingRef.current !== item.post.id) {
      if (preloadedRemixFeed && preloadedRemixFeed.length > 0) {
        console.log('📦 Using preloaded remix feed for', item.post.id, ':', preloadedRemixFeed.length, 'items');
        setRemixFeed(preloadedRemixFeed);
      } else {
        // Load remix feed
        console.log('🔄 Loading remix feed for', item.post.id);
        remixLoadingRef.current = item.post.id;
        
        const loadRemixFeed = async () => {
          setLoadingRemixes(true);
          try {
            // Remix functionality removed
            const remixes: any[] = [];
            console.log('✅ Loaded', remixes.length, 'remixes for', item.post.id);
            setRemixFeed(remixes);
          } catch (error) {
            console.error('❌ Failed to load remix feed for', item.post.id, ':', error);
            setRemixFeed([]);
          } finally {
            setLoadingRemixes(false);
            remixLoadingRef.current = null;
          }
        };
        
        loadRemixFeed();
      }
    }
  }, [isActive, item.post.id, preloadedRemixFeed, loadingRemixes, remixFeed.length]);
  
  // Reset state when item changes
  useEffect(() => {
    console.log('🔄 Video item changed:', item.post.id);
    
    // Cleanup all videos
    [centerVideoRef, leftVideoRef, rightVideoRef, upVideoRef, downVideoRef].forEach(ref => {
      const video = ref.current;
      if (video) {
        console.log('🔄 Resetting video on item change', {
          videoId: video.src,
          currentTime: video.currentTime,
          duration: video.duration,
          ended: video.ended
        });
        video.pause();
        video.muted = true;
        // Only reset currentTime if video hasn't ended naturally
        if (!video.ended) {
          video.currentTime = 0;
        }
      }
    });
    
    // Reset state
    setRemixFeed([]);
    setCurrentRemixIndex(0);
    setLoadingRemixes(false);
    remixLoadingRef.current = null; // Clear remix loading tracker
    setVideoReady(false);
    setLeftVideoReady(false);
    setRightVideoReady(false);
    setIsPlaying(false);
    setScrollState({ direction: null, targetIndex: null, isScrolling: false });
    x.set(0);
    userPausedRef.current = false;
    hasUserInteractedRef.current = false;
    // Also reset showControls to ensure clean feed
    setShowControls(false);
  }, [item.post.id, x]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 VideoPost unmounting - cleaning up all videos');
      [centerVideoRef, leftVideoRef, rightVideoRef, upVideoRef, downVideoRef].forEach(ref => {
        const video = ref.current;
        if (video) {
          console.log('🧹 Cleaning up video on unmount', {
            videoId: video.src,
            currentTime: video.currentTime,
            duration: video.duration,
            ended: video.ended
          });
          video.pause();
          video.muted = true;
          // Only reset currentTime if video hasn't ended naturally
          if (!video.ended) {
            video.currentTime = 0;
          }
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
  
  // Notify remix status
  useEffect(() => {
    if (onRemixStatusChange) {
      onRemixStatusChange(remixFeed.length > 0);
    }
  }, [remixFeed.length, onRemixStatusChange]);
  
  // ===== HELPER FUNCTIONS =====
  
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
    handleInteraction();
  }, [formatFilter, onFormatFilterChange, handleInteraction]);
  
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

  // Handle video end - auto-scroll to next video using existing navigation
  const handleVideoEnd = useCallback(() => {
    console.log('🎬 handleVideoEnd called', { 
      isActive, 
      hasOnNext: !!onNext, 
      videoId: item.post.id,
      currentTime: new Date().toISOString()
    });
    
    if (isActive && onNext) {
      console.log('🎬 Video ended, auto-scrolling to next video using goToNext()');
      // Use the same navigation function as keyboard down arrow
      onNext();
    } else {
      console.log('🎬 Video ended but not auto-scrolling', { 
        reason: !isActive ? 'not active' : 'no onNext handler' 
      });
    }
  }, [isActive, onNext, item.post.id]);
  
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
                loop={false}
                onLoadedMetadata={handleVideoMetadata}
                onCanPlay={(e) => {
                  console.log('🎬 Video can play', { 
                    videoId: videoItem.post.id, 
                    isCenter, 
                    duration: e.currentTarget.duration,
                    currentTime: e.currentTarget.currentTime
                  });
                  handleVideoCanPlay(e.currentTarget);
                }}
                onLoadedData={(e) => {
                  console.log('🎬 Video loaded data', { 
                    videoId: videoItem.post.id, 
                    isCenter,
                    duration: e.currentTarget.duration
                  });
                  handleVideoLoad(e.currentTarget);
                }}
                onError={(e) => {
                  const video = e.currentTarget;
                  console.log('❌ Video error:', {
                    videoId: videoItem.post.id,
                    isCenter,
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
                    videoId: videoItem.post.id,
                    isCenter,
                    networkState: e.currentTarget.networkState,
                    readyState: e.currentTarget.readyState
                  });
                }}
                onWaiting={(e) => {
                  console.log('⏳ Video waiting for data:', {
                    videoId: videoItem.post.id,
                    isCenter,
                    networkState: e.currentTarget.networkState,
                    readyState: e.currentTarget.readyState
                  });
                }}
                onPlay={(e) => {
                  console.log('▶️ VIDEO PLAY EVENT (VideoPost):', { 
                    videoId: videoItem.post.id, 
                    isCenter,
                    currentTime: e.currentTarget.currentTime.toFixed(1),
                    remixIndex: currentRemixIndex
                  });
                  // Sync React state when video actually starts playing
                  if (isCenter) {
                    setIsPlaying(true);
                  }
                }}
                onPause={(e) => {
                  console.log('⏸️ VIDEO PAUSE EVENT (VideoPost):', { 
                    videoId: videoItem.post.id, 
                    isCenter,
                    currentTime: e.currentTarget.currentTime.toFixed(1),
                    remixIndex: currentRemixIndex,
                    reason: userPausedRef.current ? 'user' : 'automatic'
                  });
                  
                  // Capture stack trace to see what caused the pause
                  if (!userPausedRef.current && isCenter) {
                    console.log('📍 AUTOMATIC PAUSE STACK TRACE (VideoPost):', new Error().stack);
                  }
                  
                  // Sync React state when video actually pauses
                  if (isCenter) {
                    setIsPlaying(false);
                  }
                }}
                onTimeUpdate={(e) => {
                  const video = e.currentTarget;
                  const progress = (video.currentTime / video.duration) * 100;
                  // Log when video is near the end (last 5%)
                  if (progress > 95 && progress < 100) {
                    console.log('🎬 Video near end', { 
                      videoId: videoItem.post.id, 
                      progress: progress.toFixed(1) + '%',
                      currentTime: video.currentTime,
                      duration: video.duration,
                      ended: video.ended
                    });
                  }
                }}
                onEnded={isCenter ? ((e) => {
                  console.log('🎬 Video onEnded event fired', { 
                    videoId: videoItem.post.id, 
                    isCenter,
                    duration: e.currentTarget.duration,
                    currentTime: e.currentTarget.currentTime,
                    ended: e.currentTarget.ended,
                    paused: e.currentTarget.paused,
                    readyState: e.currentTarget.readyState
                  });
                  handleVideoEnd();
                }) : undefined}
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
            muted
            playsInline
            loop={false}
            preload="auto"
            onCanPlay={() => {
              if (isLeft) handleLeftVideoCanPlay();
              else handleRightVideoCanPlay();
            }}
            onLoadedData={() => {
              if (isLeft) handleLeftVideoCanPlay();
              else handleRightVideoCanPlay();
            }}
          />
        )}
      </div>
    );
  }, [getAllItems, videoWidth, videoReady, leftVideoReady, rightVideoReady, isMuted, 
      getVideoRefForItem, handleVideoMetadata, handleVideoCanPlay, handleVideoLoad, 
      handleLeftVideoCanPlay, handleRightVideoCanPlay, handleVideoEnd, currentRemixIndex]);

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
          {/* Play/Pause Button - Upper Left Corner - Controlled by showControls */}
          {videoReady && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ 
                opacity: showControls ? 1 : 0,
                x: showControls ? 0 : -20
              }}
              className="absolute top-4 z-30"
              style={{ 
                left: videoWidth ? `calc(50% - ${videoWidth/2}px + 1rem)` : '1rem',
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
              {(() => {
                const displayName = currentItem.profile.display_name;
                const username = currentItem.profile.username;
                const finalName = displayName || username || 'Sora User';
                
                // 🔍 USERNAME LOGGING: Log username rendering decision
                console.log('👤 VideoPost rendering username:', {
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
        </motion.div>
      )}
      
      {/* Remix Navigation - positioned at very bottom center of video - Controlled by showControls */}
      {videoReady && hasRemixes && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: showControls ? 1 : 0,
            y: showControls ? 0 : 20
          }}
          className="absolute bottom-4 z-40"
          style={{ 
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: showControls ? 'auto' : 'none'
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