'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import VideoPost from './VideoPost';

interface VideoFeedProps {
  items: SoraFeedItem[];
}

export default function VideoFeed({ items }: VideoFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);

  const goToNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
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
    
    setTimeout(() => setIsScrolling(false), 500);
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
      
      setTimeout(() => setIsScrolling(false), 500);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isScrolling) return;
    
    if (e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault();
      setIsScrolling(true);
      goToNext();
      setTimeout(() => setIsScrolling(false), 500);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsScrolling(true);
      goToPrevious();
      setTimeout(() => setIsScrolling(false), 500);
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
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ 
            type: 'tween',
            duration: 0.5,
            ease: 'easeInOut'
          }}
          className="absolute inset-0"
        >
          <VideoPost 
            item={items[currentIndex]} 
            isActive={true}
            onNext={goToNext}
            onPrevious={goToPrevious}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows - Desktop */}
      <div className="hidden md:flex absolute right-4 top-1/2 transform -translate-y-1/2 flex-col gap-4 z-20">
        <button
          onClick={goToPrevious}
          disabled={currentIndex === 0}
          className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronUp size={24} />
        </button>
        <button
          onClick={goToNext}
          disabled={currentIndex === items.length - 1}
          className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronDown size={24} />
        </button>
      </div>

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

      {/* Swipe Hint - Mobile */}
      <div className="md:hidden absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/70 text-sm z-20">
        Swipe up/down to navigate
      </div>
    </div>
  );
}
