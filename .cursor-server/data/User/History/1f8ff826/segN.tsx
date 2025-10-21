'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import { fetchRemixFeed } from '@/lib/api';
import VideoPost from './VideoPost';

interface VideoFeedProps {
  items: SoraFeedItem[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onAddToFavorites?: (item: SoraFeedItem) => void;
  onRemoveFromFavorites?: (postId: string) => void;
  isInFavorites?: (postId: string) => boolean;
  onControlsChange?: (showing: boolean) => void;
}

export default function VideoFeed({ items, onLoadMore, hasMore, loadingMore, onAddToFavorites, onRemoveFromFavorites, isInFavorites, onControlsChange }: VideoFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [preloadedRemixFeeds, setPreloadedRemixFeeds] = useState<Map<string, SoraFeedItem[]>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  
  // Reset currentIndex when items array changes (e.g., switching to favorites)
  useEffect(() => {
    if (items.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= items.length) {
      setCurrentIndex(0);
      y.set(0);
    }
  }, [items, currentIndex, y]);
  
  const goToNext = () => {
    if (currentIndex < items.length - 1) {
      // Animate to next position then change index
      const targetY = -window.innerHeight;
      animate(y, targetY, {
        type: 'spring',
        stiffness: 400,
        damping: 40,
        onComplete: () => {
          setCurrentIndex(currentIndex + 1);
          
          // Load more when approaching the end
          if (currentIndex >= items.length - 3 && hasMore && !loadingMore && onLoadMore) {
            onLoadMore();
          }
        }
      });
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      // Animate to previous position then change index
      const targetY = window.innerHeight;
      animate(y, targetY, {
        type: 'spring',
        stiffness: 400,
        damping: 40,
        onComplete: () => {
          setCurrentIndex(currentIndex - 1);
        }
      });
    }
  };

  // Drag handler
  const bind = useDrag(
    ({ down, movement: [, my], velocity: [, vy] }) => {
      // Prevent dragging beyond bounds
      if (currentIndex === 0 && my > 0) {
        y.set(my * 0.2); // Rubber band effect at top
        return;
      }
      if (currentIndex === items.length - 1 && my < 0) {
        y.set(my * 0.2); // Rubber band effect at bottom
        return;
      }

      if (down) {
        // While dragging, update position
        y.set(my);
      } else {
        // Released - determine if we should snap to next/previous
        const threshold = window.innerHeight * 0.2; // 20% of screen height
        const shouldNavigate = Math.abs(my) > threshold || Math.abs(vy) > 0.5;

        if (shouldNavigate) {
          if (my < 0 && currentIndex < items.length - 1) {
            // Swiped up - animate to next position then change index
            const targetY = -window.innerHeight;
            animate(y, targetY, {
              type: 'spring',
              stiffness: 400,
              damping: 40,
              onComplete: () => {
                goToNext();
              }
            });
          } else if (my > 0 && currentIndex > 0) {
            // Swiped down - animate to previous position then change index
            const targetY = window.innerHeight;
            animate(y, targetY, {
              type: 'spring',
              stiffness: 400,
              damping: 40,
              onComplete: () => {
                goToPrevious();
              }
            });
          } else {
            // Snap back to position if can't navigate
            animate(y, 0, {
              type: 'spring',
              stiffness: 300,
              damping: 30,
            });
          }
        } else {
          // Snap back to position
          animate(y, 0, {
            type: 'spring',
            stiffness: 300,
            damping: 30,
          });
        }
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (isScrolling) return;
    
    setIsScrolling(true);
    
    if (e.deltaY > 0) {
      goToNext();
    } else {
      goToPrevious();
    }
    
    setTimeout(() => setIsScrolling(false), 500); // Increased timeout for animation
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isScrolling) return;
    
    // Don't trigger navigation if user is typing in an input field
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      (activeElement as HTMLElement).isContentEditable
    );
    
    if (isTyping) return;
    
    if (e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault();
      setIsScrolling(true);
      goToNext();
      setTimeout(() => setIsScrolling(false), 500); // Increased timeout for animation
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsScrolling(true);
      goToPrevious();
      setTimeout(() => setIsScrolling(false), 500); // Increased timeout for animation
    }
    // Left/Right arrow keys are handled by VideoPost component for remix navigation
  };

  // Reset y position when index changes
  useEffect(() => {
    y.set(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Handle remix status change from current video
  const handleRemixStatusChange = () => {
    // Status tracking removed as it was unused
  };

  // Handle keyboard navigation for remixes
  const handleKeyboardNavigation = () => {
    // This is handled directly in VideoPost component
  };

  // Notify parent when controls visibility changes
  useEffect(() => {
    if (onControlsChange) {
      onControlsChange(showControls);
    }
  }, [showControls, onControlsChange]);

  // Preload remix feeds for upcoming videos
  const preloadRemixFeeds = async () => {
    const preloadPromises: Promise<void>[] = [];
    
    // Preload remix feeds for next 4-5 videos
    for (let i = 1; i <= 5; i++) {
      const targetIndex = currentIndex + i;
      if (targetIndex < items.length) {
        const item = items[targetIndex];
        const postId = item.post.id;
        
        // Skip if already preloaded
        if (!preloadedRemixFeeds.has(postId)) {
          const promise = fetchRemixFeed(postId, 10)
            .then((feed) => {
              setPreloadedRemixFeeds(prev => {
                const newMap = new Map(prev);
                newMap.set(postId, feed.items || []);
                return newMap;
              });
            })
            .catch((error) => {
              console.log(`Failed to preload remix feed for ${postId}:`, error);
            });
          
          preloadPromises.push(promise);
        }
      }
    }
    
    // Execute all preloads in parallel
    await Promise.allSettled(preloadPromises);
  };

  // Preload remix feeds when current index changes
  useEffect(() => {
    // Small delay to avoid blocking the main navigation
    const timeoutId = setTimeout(() => {
      preloadRemixFeeds();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Clean up old preloaded feeds to prevent memory leaks
  useEffect(() => {
    setPreloadedRemixFeeds(prev => {
      const newMap = new Map(prev);
      const keysToDelete: string[] = [];
      
      // Remove feeds that are more than 10 videos behind current position
      newMap.forEach((_, postId) => {
        const itemIndex = items.findIndex(item => item.post.id === postId);
        if (itemIndex !== -1 && itemIndex < currentIndex - 10) {
          keysToDelete.push(postId);
        }
      });
      
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
  }, [currentIndex, items]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isScrolling]);

  // Safety check: don't render if no items or currentIndex is out of bounds
  if (!items || items.length === 0 || currentIndex >= items.length) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-black flex items-center justify-center">
        <p className="text-white text-lg">No videos available</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-black"
      tabIndex={0}
    >
      {/* Draggable container with all videos */}
      <motion.div
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(bind() as any)}
        style={{ y }}
        className="absolute inset-0"
      >
        {/* Previous Video */}
        {currentIndex > 0 && (
          <div 
            className="absolute inset-0 w-full h-screen"
            style={{ transform: 'translateY(-100%)' }}
          >
            <VideoPost 
              item={items[currentIndex - 1]} 
              isActive={false}
              onNext={goToNext}
              onPrevious={goToPrevious}
              onAddToFavorites={onAddToFavorites}
              onRemoveFromFavorites={onRemoveFromFavorites}
              isInFavorites={isInFavorites}
            />
          </div>
        )}
        
        {/* Current Video */}
        <div className="absolute inset-0 w-full h-screen">
          <VideoPost 
            item={items[currentIndex]} 
            isActive={true}
            onNext={goToNext}
            onPrevious={goToPrevious}
            onAddToFavorites={onAddToFavorites}
            onRemoveFromFavorites={onRemoveFromFavorites}
            isInFavorites={isInFavorites}
            onRemixStatusChange={handleRemixStatusChange}
            onKeyboardNavigation={handleKeyboardNavigation}
            preloadedRemixFeed={items[currentIndex] ? preloadedRemixFeeds.get(items[currentIndex].post.id) : undefined}
            onControlsChange={setShowControls}
          />
        </div>

        {/* Next Video */}
        {currentIndex < items.length - 1 && (
          <div 
            className="absolute inset-0 w-full h-screen"
            style={{ transform: 'translateY(100%)' }}
          >
            <VideoPost 
              item={items[currentIndex + 1]} 
              isActive={false}
              onNext={goToNext}
              onPrevious={goToPrevious}
              onAddToFavorites={onAddToFavorites}
              onRemoveFromFavorites={onRemoveFromFavorites}
              isInFavorites={isInFavorites}
            />
          </div>
        )}
      </motion.div>

      {/* Preload next videos for better performance */}
      <div className="absolute -top-full left-0 w-full h-screen opacity-0 pointer-events-none">
        {/* Preload next video */}
        {currentIndex < items.length - 1 && (
          <video
            src={items[currentIndex + 1].post.attachments[0]?.encodings?.md?.path || 
                 items[currentIndex + 1].post.attachments[0]?.encodings?.source?.path}
            preload="metadata"
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        )}
        
        {/* Preload video after next */}
        {currentIndex < items.length - 2 && (
          <video
            src={items[currentIndex + 2].post.attachments[0]?.encodings?.md?.path || 
                 items[currentIndex + 2].post.attachments[0]?.encodings?.source?.path}
            preload="none"
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {/* Navigation Arrows - Top and Bottom */}
      {/* Up Arrow - Under Feed Type Dropdown */}
      <motion.button
        initial={{ opacity: 0, y: -20 }}
        animate={{ 
          opacity: showControls && currentIndex > 0 ? 1 : 0,
          y: showControls && currentIndex > 0 ? 0 : -20
        }}
        transition={{ duration: 0.3 }}
        onClick={goToPrevious}
        disabled={currentIndex === 0}
        className="absolute top-24 left-1/2 transform -translate-x-1/2 z-40 p-4 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-all"
        style={{ pointerEvents: showControls && currentIndex > 0 ? 'auto' : 'none' }}
      >
        <ChevronUp size={28} />
      </motion.button>
      
      {/* Down Arrow - Just above remix indicator */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ 
          opacity: showControls && currentIndex < items.length - 1 ? 1 : 0,
          y: showControls && currentIndex < items.length - 1 ? 0 : 20
        }}
        transition={{ duration: 0.3 }}
        onClick={goToNext}
        disabled={currentIndex === items.length - 1}
        className="absolute bottom-12 left-1/2 transform -translate-x-1/2 z-50 p-3 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-all"
        style={{ pointerEvents: showControls && currentIndex < items.length - 1 ? 'auto' : 'none' }}
      >
        <ChevronDown size={24} />
      </motion.button>

      {/* Loading More Indicator */}
      {loadingMore && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span className="text-white text-sm">Loading more...</span>
          </div>
        </div>
      )}

      {/* Swipe Hint - Mobile */}
      <div className="md:hidden absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/70 text-sm z-50 pointer-events-none">
        Swipe up/down to navigate
      </div>
    </div>
  );
}
