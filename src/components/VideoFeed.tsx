'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import VideoPost from './VideoPost';

interface VideoFeedProps {
  items: SoraFeedItem[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onAddToFavorites?: (item: SoraFeedItem) => void;
  onRemoveFromFavorites?: (postId: string) => void;
  isInFavorites?: (postId: string) => boolean;
}

export default function VideoFeed({ items, onLoadMore, hasMore, loadingMore, onAddToFavorites, onRemoveFromFavorites, isInFavorites }: VideoFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const animationDirectionRef = useRef<'up' | 'down'>('down');

  const goToNext = () => {
    if (currentIndex < items.length - 1) {
      animationDirectionRef.current = 'down';
      setScrollDirection('down');
      setCurrentIndex(currentIndex + 1);
      
      // Load more when approaching the end
      if (currentIndex >= items.length - 3 && hasMore && !loadingMore && onLoadMore) {
        onLoadMore();
      }
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      animationDirectionRef.current = 'up';
      setScrollDirection('up');
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleWheel = (e: WheelEvent) => {
    if (isScrolling) return;
    
    setIsScrolling(true);
    
    if (e.deltaY > 0) {
      goToNext();
    } else {
      goToPrevious();
    }
    
    setTimeout(() => setIsScrolling(false), 300);
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (isScrolling) return;
    
    const deltaY = touchStartY.current - touchEndY.current;
    const minSwipeDistance = 50;
    
    if (Math.abs(deltaY) > minSwipeDistance) {
      setIsScrolling(true);
      
      if (deltaY > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
      
      setTimeout(() => setIsScrolling(false), 300);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isScrolling) return;
    
    if (e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault();
      setIsScrolling(true);
      goToNext();
      setTimeout(() => setIsScrolling(false), 300);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsScrolling(true);
      goToPrevious();
      setTimeout(() => setIsScrolling(false), 300);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentIndex, isScrolling]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-black"
      tabIndex={0}
    >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ y: animationDirectionRef.current === 'down' ? '100%' : '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: animationDirectionRef.current === 'down' ? '-100%' : '100%' }}
            transition={{ 
              type: 'tween',
              duration: 0.3,
              ease: 'easeOut'
            }}
            className="absolute inset-0"
          >
          <VideoPost 
            item={items[currentIndex]} 
            isActive={true}
            onNext={goToNext}
            onPrevious={goToPrevious}
            onAddToFavorites={onAddToFavorites}
            onRemoveFromFavorites={onRemoveFromFavorites}
            isInFavorites={isInFavorites}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows - Top and Bottom */}
      {/* Up Arrow - Top of Screen */}
      <button
        onClick={goToPrevious}
        disabled={currentIndex === 0}
        className="absolute top-6 left-1/2 transform -translate-x-1/2 z-20 p-4 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <ChevronUp size={28} />
      </button>
      
      {/* Down Arrow - Bottom of Screen */}
      <button
        onClick={goToNext}
        disabled={currentIndex === items.length - 1}
        className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-20 p-4 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <ChevronDown size={28} />
      </button>

      {/* Clickable Areas for Navigation */}
      {/* Top clickable area */}
      <button
        onClick={goToPrevious}
        disabled={currentIndex === 0}
        className="absolute top-0 left-0 right-0 h-24 z-10 bg-transparent hover:bg-black/5 disabled:cursor-not-allowed transition-all"
        aria-label="Previous video"
      />
      
      {/* Bottom clickable area */}
      <button
        onClick={goToNext}
        disabled={currentIndex === items.length - 1}
        className="absolute bottom-0 left-0 right-0 h-24 z-10 bg-transparent hover:bg-black/5 disabled:cursor-not-allowed transition-all"
        aria-label="Next video"
      />

      {/* Progress Indicator */}
      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex flex-col gap-1 z-20">
        {items.map((_, index) => (
          <div
            key={index}
            className={`w-1 h-8 rounded-full transition-all duration-300 ${
              index === currentIndex ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>

      {/* Loading More Indicator */}
      {loadingMore && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-20">
          <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span className="text-white text-sm">Loading more...</span>
          </div>
        </div>
      )}

      {/* Swipe Hint - Mobile */}
      <div className="md:hidden absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/70 text-sm z-20">
        Swipe up/down to navigate
      </div>
    </div>
  );
}
