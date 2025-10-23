'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { SoraFeedItem } from '@/types/sora';
import VideoCarousel from './VideoCarousel';

interface VerticalCarouselProps {
  items: SoraFeedItem[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onAddToFavorites?: (item: SoraFeedItem) => void;
  onRemoveFromFavorites?: (postId: string) => void;
  isInFavorites?: (postId: string) => boolean;
  onControlsChange?: (showing: boolean) => void;
  onCustomFeedVideoEvent?: (eventType: 'loadedmetadata' | 'ended' | 'timeupdate', videoDuration?: number, currentTime?: number, videoIndex?: number) => void;
  formatFilter?: 'both' | 'tall' | 'wide';
  onFormatFilterChange?: (filter: 'both' | 'tall' | 'wide') => void;
}

export default function VerticalCarousel({
  items,
  onLoadMore,
  hasMore,
  loadingMore,
  onAddToFavorites,
  onRemoveFromFavorites,
  isInFavorites,
  onControlsChange,
  onCustomFeedVideoEvent,
  formatFilter,
  onFormatFilterChange
}: VerticalCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const wheelAccumulator = useRef(0);
  const wheelTimeout = useRef<NodeJS.Timeout | null>(null);
  const isWheelScrolling = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const committedDirection = useRef<'vertical' | 'horizontal' | null>(null);
  
  // Configure Embla for vertical scrolling with direction detection and axis locking
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      axis: 'y',
      loop: false,
      skipSnaps: false,
      dragFree: false,
      containScroll: 'trimSnaps',
      startIndex: 0,
      dragThreshold: 10,
      inViewThreshold: 0.8,
      watchDrag: (emblaApi, evt) => {
        // Detect if drag is more vertical or horizontal, and lock to that axis
        if (evt.type.includes('down') || evt.type.includes('start')) {
          // Reset and store initial position
          const clientX = evt.type.includes('touch') 
            ? ((evt as TouchEvent).touches[0])?.clientX || 0
            : (evt as MouseEvent).clientX;
          const clientY = evt.type.includes('touch') 
            ? ((evt as TouchEvent).touches[0])?.clientY || 0
            : (evt as MouseEvent).clientY;
          dragStartPos.current = { x: clientX, y: clientY };
          committedDirection.current = null; // Reset direction
          console.log('🟦 VERTICAL: Drag START at', { x: clientX, y: clientY, eventType: evt.type });
          return true; // Allow drag to start
        }
        
        if (evt.type.includes('move')) {
          if (!dragStartPos.current) {
            console.log('🟦 VERTICAL: Drag move but no start position');
            return false;
          }
          
          // If direction is already committed, stick with it (axis locking)
          if (committedDirection.current === 'horizontal') {
            console.log('🟦 VERTICAL: LOCKED to horizontal, rejecting');
            return false; // Let VideoCarousel handle it
          }
          if (committedDirection.current === 'vertical') {
            console.log('🟦 VERTICAL: LOCKED to vertical, accepting');
            return true; // Stay locked to vertical
          }
          
          // Direction not yet committed - determine it
          const clientX = evt.type.includes('touch') 
            ? ((evt as TouchEvent).touches[0])?.clientX || 0
            : (evt as MouseEvent).clientX;
          const clientY = evt.type.includes('touch') 
            ? ((evt as TouchEvent).touches[0])?.clientY || 0
            : (evt as MouseEvent).clientY;
          
          const deltaX = Math.abs(clientX - dragStartPos.current.x);
          const deltaY = Math.abs(clientY - dragStartPos.current.y);
          
          // Need at least 10px of movement to determine direction
          if (deltaX > 10 || deltaY > 10) {
            if (deltaX > deltaY) {
              // More horizontal movement - commit to horizontal and reject
              committedDirection.current = 'horizontal';
              console.log('🟦 VERTICAL: COMMITTING to horizontal', { deltaX, deltaY, ratio: (deltaX/deltaY).toFixed(2) });
              return false;
            } else {
              // More vertical movement - commit to vertical and accept
              committedDirection.current = 'vertical';
              console.log('🟦 VERTICAL: COMMITTING to vertical', { deltaX, deltaY, ratio: (deltaY/deltaX).toFixed(2) });
              return true;
            }
          }
          return true; // Not enough movement yet, allow
        }
        
        if (evt.type.includes('up') || evt.type.includes('end')) {
          console.log('🟦 VERTICAL: Drag END, resetting direction');
          dragStartPos.current = null;
          committedDirection.current = null;
        }
        
        return true;
      },
    },
    [WheelGesturesPlugin({
      wheelDraggingClass: 'is-wheel-dragging',
      forceWheelAxis: 'y', // Force vertical scrolling only
      target: undefined,
    })]
  );

  // Handle slide selection
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const selectedIndex = emblaApi.selectedScrollSnap();
    console.log('🟦 VERTICAL: Slide changed', { 
      from: currentIndexRef.current, 
      to: selectedIndex,
      totalItems: items.length 
    });
    currentIndexRef.current = selectedIndex;
    setCurrentIndex(selectedIndex);
    
    // Load more items when approaching the end
    if (hasMore && !loadingMore && selectedIndex >= items.length - 2) {
      onLoadMore?.();
    }
  }, [emblaApi, hasMore, loadingMore, items.length, onLoadMore]);

  // Custom wheel handler with threshold-based completion
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!emblaApi) return;
    
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
      if (wheelAccumulator.current > 0 && currentIndexRef.current < items.length - 1) {
        // Scroll down
        emblaApi.scrollNext();
        wheelAccumulator.current = 0;
        isWheelScrolling.current = true;
      } else if (wheelAccumulator.current < 0 && currentIndexRef.current > 0) {
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
  }, [emblaApi, items.length]);

  // Set up event listeners
  useEffect(() => {
    if (!emblaApi) return;
    
    emblaApi.on('select', onSelect);
    emblaApi.on('settle', () => {
      isWheelScrolling.current = false;
    });
    
    onSelect(); // Call once to set initial state
    
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('settle', () => {});
    };
  }, [emblaApi, onSelect]);

  // Add wheel event listener
  useEffect(() => {
    if (!emblaApi) return;
    
    const container = emblaApi.containerNode();
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel, emblaApi]);

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
              onCustomFeedVideoEvent={onCustomFeedVideoEvent ? (eventType, videoDuration, currentTime) => {
                onCustomFeedVideoEvent(eventType, videoDuration, currentTime, index);
              } : undefined}
              formatFilter={formatFilter}
              onFormatFilterChange={onFormatFilterChange}
              nextItem={index < items.length - 1 ? items[index + 1] : undefined}
              onNext={() => {
                console.log('🎬 VideoCarousel requested next video via onNext');
                if (emblaApi && currentIndex < items.length - 1) {
                  emblaApi.scrollNext();
                } else {
                  console.log('🎬 Cannot go to next video - at end of feed');
                }
              }}
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
