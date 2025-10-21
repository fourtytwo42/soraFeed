'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { SoraFeedItem } from '@/types/sora';
import VideoCarousel from './VideoCarousel';
import { useGestureContext } from '@/contexts/GestureContext';

interface VerticalCarouselProps {
  items: SoraFeedItem[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onAddToFavorites?: (item: SoraFeedItem) => void;
  onRemoveFromFavorites?: (postId: string) => void;
  isInFavorites?: (postId: string) => boolean;
  onControlsChange?: (showing: boolean) => void;
}

export default function VerticalCarousel({
  items,
  onLoadMore,
  hasMore,
  loadingMore,
  onAddToFavorites,
  onRemoveFromFavorites,
  isInFavorites,
  onControlsChange
}: VerticalCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const wheelAccumulator = useRef(0);
  const wheelTimeout = useRef<NodeJS.Timeout | null>(null);
  const isWheelScrolling = useRef(false);
  
  // Shared gesture context
  const gestureContext = useGestureContext();
  
  // Configure Embla for vertical scrolling with custom wheel handling
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      axis: 'y',
      loop: false,
      skipSnaps: false,
      dragFree: false,
      containScroll: 'trimSnaps',
      startIndex: 0,
      dragThreshold: 10, // Lower threshold for more responsive vertical swiping
      inViewThreshold: 0.8, // Snap when 80% of slide is visible
      watchDrag: (emblaApi, evt) => {
        // Block vertical dragging if horizontal gesture is active
        if (gestureContext.shouldBlockGesture('vertical')) {
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
          gestureContext.startGesture(clientX, clientY, 15); // Moderate threshold for vertical
        } else if (evt.type.includes('move') || evt.type === 'mousemove') {
          const direction = gestureContext.updateGesture(clientX, clientY);
          return direction === 'vertical' || direction === null;
        }
        
        return gestureContext.isGestureActive('vertical');
      }
    }
  );

  // Handle slide selection
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const selectedIndex = emblaApi.selectedScrollSnap();
    setCurrentIndex(selectedIndex);
    
    // Load more items when approaching the end
    if (hasMore && !loadingMore && selectedIndex >= items.length - 2) {
      onLoadMore?.();
    }
  }, [emblaApi, hasMore, loadingMore, items.length, onLoadMore]);

  // Custom wheel handler with threshold-based completion
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!emblaApi || gestureContext.shouldBlockGesture('vertical')) {
      return;
    }
    
    e.preventDefault();
    
    // Accumulate wheel delta for more responsive scrolling
    wheelAccumulator.current += e.deltaY;
    
    // Clear existing timeout
    if (wheelTimeout.current) {
      clearTimeout(wheelTimeout.current);
    }
    
    // Threshold for triggering navigation (lower = more sensitive)
    const threshold = 50;
    
    if (Math.abs(wheelAccumulator.current) > threshold) {
      if (wheelAccumulator.current > 0 && currentIndex < items.length - 1) {
        // Scroll down
        emblaApi.scrollNext();
        wheelAccumulator.current = 0;
        isWheelScrolling.current = true;
      } else if (wheelAccumulator.current < 0 && currentIndex > 0) {
        // Scroll up
        emblaApi.scrollPrev();
        wheelAccumulator.current = 0;
        isWheelScrolling.current = true;
      } else {
        // Hit boundary, reset accumulator
        wheelAccumulator.current = 0;
      }
    } else {
      // Set timeout to reset accumulator if no more wheel events
      wheelTimeout.current = setTimeout(() => {
        wheelAccumulator.current = 0;
        isWheelScrolling.current = false;
      }, 150);
    }
  }, [emblaApi, currentIndex, items.length, gestureContext]);

  // Set up event listeners
  useEffect(() => {
    if (!emblaApi) return;
    
    emblaApi.on('select', onSelect);
    emblaApi.on('settle', () => {
      gestureContext.endGesture();
      isWheelScrolling.current = false;
    });
    emblaApi.on('pointerUp', () => {
      gestureContext.endGesture();
    });
    
    onSelect(); // Call once to set initial state
    
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('settle', () => {});
      emblaApi.off('pointerUp', () => {});
    };
  }, [emblaApi, onSelect, gestureContext]);

  // Add wheel event listener
  useEffect(() => {
    const container = emblaRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!emblaApi) return;
      
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
        emblaApi.scrollNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        emblaApi.scrollPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [emblaApi]);

  // Navigation functions for external use
  const scrollToNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollToPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  return (
    <div className="h-dvh overflow-hidden bg-black" ref={emblaRef}>
      <div className="flex flex-col h-full">
        {items.map((item, index) => (
          <div 
            key={item.post.id}
            className="flex-shrink-0 h-dvh"
          >
            <VideoCarousel
              item={item}
              isActive={index === currentIndex}
              isUpcoming={index === currentIndex + 1}
              onAddToFavorites={onAddToFavorites}
              onRemoveFromFavorites={onRemoveFromFavorites}
              isInFavorites={isInFavorites}
              onControlsChange={onControlsChange}
            />
          </div>
        ))}
        
        {/* Loading indicator */}
        {loadingMore && (
          <div className="flex-shrink-0 h-dvh flex items-center justify-center bg-black">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
      </div>
    </div>
  );
}
