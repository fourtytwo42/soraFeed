'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  
  // Configure Embla for vertical scrolling with wheel gestures
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      axis: 'y',
      loop: false,
      skipSnaps: false,
      dragFree: false,
      containScroll: 'trimSnaps',
      startIndex: 0,
    },
    [WheelGesturesPlugin()]
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

  // Set up event listeners
  useEffect(() => {
    if (!emblaApi) return;
    
    emblaApi.on('select', onSelect);
    onSelect(); // Call once to set initial state
    
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

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
