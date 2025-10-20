'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Heart, Share, User, CheckCircle, ChevronLeft, ChevronRight, RotateCcw, MoreHorizontal } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';
import { fetchRemixFeed } from '@/lib/api';

interface VideoPostProps {
  item: SoraFeedItem;
  isActive: boolean;
  onNext: () => void;
  onPrevious: () => void;
}

export default function VideoPost({ item, isActive, onNext, onPrevious }: VideoPostProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // Start unmuted
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [remixFeed, setRemixFeed] = useState<SoraFeedItem[]>([]);
  const [currentRemixIndex, setCurrentRemixIndex] = useState(0);
  const [loadingRemixes, setLoadingRemixes] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragDirection, setDragDirection] = useState<'horizontal' | 'vertical' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get current item (original post or remix)
  const getCurrentItem = (): SoraFeedItem => {
    if (currentRemixIndex === 0 || !remixFeed.length) {
      return item; // Original post
    }
    return remixFeed[currentRemixIndex - 1]; // Video remix (index - 1 because 0 is original)
  };

  const currentItem = getCurrentItem();
  const currentVideoUrl = currentItem.post.attachments[0]?.encodings?.md?.path || 
                          currentItem.post.attachments[0]?.encodings?.source?.path;
  
  // All items from remix feed should be actual video remixes
  const hasRemixes = remixFeed.length > 0;
  const canGoLeft = currentRemixIndex > 0;
  const canGoRight = currentRemixIndex < remixFeed.length;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
      
      // Fetch remix feed when video becomes active
      if (remixFeed.length === 0 && !loadingRemixes) {
        loadRemixFeed();
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

  // Handle video changes when switching remixes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive && isPlaying) {
      video.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [currentRemixIndex, currentVideoUrl]);

  const loadRemixFeed = async () => {
    try {
      setLoadingRemixes(true);
      console.log('🔄 Loading remix feed for post:', item.post.id);
      const feed = await fetchRemixFeed(item.post.id, 10);
      setRemixFeed(feed.items || []);
      console.log('✅ Loaded remix feed with', feed.items?.length || 0, 'video remixes');
    } catch (error) {
      console.error('❌ Failed to load remix feed:', error);
    } finally {
      setLoadingRemixes(false);
    }
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  const goToPreviousRemix = () => {
    if (currentRemixIndex > 0) {
      setCurrentRemixIndex(currentRemixIndex - 1);
      // Auto-play the new remix video
      setTimeout(() => {
        const video = videoRef.current;
        if (video && isActive) {
          video.play().catch(() => {
            setIsPlaying(false);
          });
        }
      }, 100);
    }
  };

  const goToNextRemix = () => {
    const maxIndex = remixFeed.length;
    if (currentRemixIndex < maxIndex) {
      setCurrentRemixIndex(currentRemixIndex + 1);
      // Auto-play the new remix video
      setTimeout(() => {
        const video = videoRef.current;
        if (video && isActive) {
          video.play().catch(() => {
            setIsPlaying(false);
          });
        }
      }, 100);
    }
  };

  const goToRemixIndex = (index: number) => {
    const maxIndex = remixFeed.length;
    if (index >= 0 && index <= maxIndex) {
      setCurrentRemixIndex(index);
      // Auto-play the new remix video
      setTimeout(() => {
        const video = videoRef.current;
        if (video && isActive) {
          video.play().catch(() => {
            setIsPlaying(false);
          });
        }
      }, 100);
    }
  };

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX, y: clientY });
    setDragOffset({ x: 0, y: 0 });
    setDragDirection(null);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    
    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;
    
    // Determine drag direction if not set (after minimum movement)
    if (!dragDirection && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        setDragDirection('horizontal');
      } else {
        setDragDirection('vertical');
      }
    }
    
    // Constrain movement to the determined direction (rail system)
    if (dragDirection === 'horizontal') {
      // Only allow horizontal movement for remix navigation
      setDragOffset({ x: deltaX, y: 0 });
    } else if (dragDirection === 'vertical') {
      // Only allow vertical movement for feed navigation
      setDragOffset({ x: 0, y: deltaY });
    } else {
      // No direction determined yet, allow free movement until direction is locked
      setDragOffset({ x: deltaX, y: deltaY });
    }
  };

  const handleDragEnd = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    
    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;
    const threshold = 50;

    // Determine if it's a horizontal or vertical swipe
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe - remix navigation
      if (Math.abs(deltaX) > threshold && hasRemixes) {
        if (deltaX > 0 && canGoLeft) {
          goToPreviousRemix();
        } else if (deltaX < 0 && canGoRight) {
          goToNextRemix();
        }
      }
    } else {
      // Vertical swipe - feed navigation
      if (Math.abs(deltaY) > threshold) {
        if (deltaY > 0) {
          onPrevious();
        } else {
          onNext();
        }
      }
    }

    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    setDragDirection(null);
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    handleDragEnd(e.clientX, e.clientY);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (isDragging) {
      handleDragEnd(e.clientX, e.clientY);
    }
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    handleDragEnd(touch.clientX, touch.clientY);
  };

  // Mouse wheel events
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    // Check if it's horizontal scroll (shift+wheel or horizontal wheel)
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal scroll - remix navigation
      if (hasRemixes) {
        if (e.deltaX > 0 || (e.shiftKey && e.deltaY > 0)) {
          // Scroll right - next remix
          if (canGoRight) {
            goToNextRemix();
          }
        } else if (e.deltaX < 0 || (e.shiftKey && e.deltaY < 0)) {
          // Scroll left - previous remix
          if (canGoLeft) {
            goToPreviousRemix();
          }
        }
      }
    } else {
      // Vertical scroll - feed navigation
      if (e.deltaY > 0) {
        // Scroll down - next video
        onNext();
      } else if (e.deltaY < 0) {
        // Scroll up - previous video
        onPrevious();
      }
    }
  };

  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <div 
      className="relative w-full h-full flex items-center justify-center bg-black group cursor-pointer select-none"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={handleMouseLeave}
      onClick={() => setShowControls(!showControls)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      style={{
        transform: isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : 'none',
        transition: isDragging ? 'none' : 'transform 0.2s ease-out'
      }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={currentVideoUrl}
        className="max-w-full h-screen object-contain"
        loop
        muted={isMuted}
        playsInline
        onEnded={handleVideoEnd}
        poster={currentItem.post.attachments[0]?.encodings?.thumbnail?.path}
        key={currentItem.post.id} // Force re-render when switching remixes
      >
        {currentVideoUrl && <source src={currentVideoUrl} type="video/mp4" />}
      </video>

      {/* Play/Pause Overlay */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: (!isPlaying && showControls) ? 1 : 0, 
          scale: (!isPlaying && showControls) ? 1 : 0.8 
        }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="p-4 rounded-full bg-black/50 backdrop-blur-sm">
          <Play size={48} className="text-white ml-1" />
        </div>
      </motion.div>

      {/* Click to play/pause */}
      <div 
        className="absolute inset-0"
        onClick={(e) => {
          e.stopPropagation();
          togglePlayPause();
        }}
      />

      {/* Horizontal Navigation for Remixes */}
      {hasRemixes && (
        <>
          {/* Left Arrow */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ 
              opacity: (showControls && canGoLeft) ? 1 : 0,
              x: (showControls && canGoLeft) ? 0 : -20
            }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              e.stopPropagation();
              goToPreviousRemix();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
            disabled={!canGoLeft}
          >
            <ChevronLeft size={24} />
          </motion.button>

          {/* Right Arrow */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ 
              opacity: (showControls && canGoRight) ? 1 : 0,
              x: (showControls && canGoRight) ? 0 : 20
            }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              e.stopPropagation();
              goToNextRemix();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
            disabled={!canGoRight}
          >
            <ChevronRight size={24} />
          </motion.button>

        </>
      )}

      {/* Controls - positioned over video */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ 
          opacity: showControls ? 1 : 0,
          y: showControls ? 0 : 20
        }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-6 left-6 right-24 z-10 pointer-events-none"
      >
        <div className="pointer-events-auto">
        {/* User Info */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <User size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">
                {currentItem.profile.display_name || currentItem.profile.username}
              </span>
              {currentItem.profile.verified && (
                <CheckCircle size={16} className="text-blue-500" />
              )}
              <span className="text-white/70 text-sm">
                {formatTimeAgo(currentItem.post.posted_at)}
              </span>
            </div>
            <div className="text-white/70 text-sm">
              {formatCount(currentItem.profile.follower_count)} followers
            </div>
          </div>
        </div>

        {/* Caption */}
        {currentItem.post.text && (
          <p className="text-white text-sm mb-2 line-clamp-3">
            {currentItem.post.text}
          </p>
        )}
        </div>
      </motion.div>

      {/* Right Side Actions - positioned over video */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ 
          opacity: showControls ? 1 : 0,
          x: showControls ? 0 : 20
        }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-6 right-6 flex flex-col gap-4 z-10"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLiked(!isLiked);
          }}
          className={`p-3 rounded-full transition-all ${
            isLiked ? 'bg-red-500 text-white' : 'bg-black/50 text-white hover:bg-black/70'
          }`}
        >
          <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} />
        </button>

        <button 
          onClick={(e) => e.stopPropagation()}
          className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
        >
          <Share size={20} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>

        {/* Remix Count Indicator */}
        {hasRemixes && (
          <div className="flex flex-col items-center">
            <button className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
              <RotateCcw size={20} />
            </button>
            <span className="text-white text-xs font-semibold bg-black/50 rounded-full px-2 py-1 mt-1">
              {remixFeed.length}
            </span>
          </div>
        )}
      </motion.div>



      {/* Remix Dot Indicators */}
      {hasRemixes && showControls && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: showControls ? 1 : 0,
            y: showControls ? 0 : 20
          }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10"
        >
          <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2 backdrop-blur-sm">
            {/* Original video dot */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToRemixIndex(0);
              }}
              className={`w-2 h-2 rounded-full transition-all ${
                currentRemixIndex === 0 
                  ? 'bg-white scale-125' 
                  : 'bg-white/50 hover:bg-white/70'
              }`}
            />
            
            {/* Remix dots - limit to 10 to avoid overcrowding */}
            {remixFeed.slice(0, 10).map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  goToRemixIndex(index + 1);
                }}
                className={`w-2 h-2 rounded-full transition-all ${
                  currentRemixIndex === index + 1
                    ? 'bg-white scale-125' 
                    : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
            
            {/* Show "..." if there are more than 10 video remixes */}
            {remixFeed.length > 10 && (
              <span className="text-white/70 text-xs ml-1">...</span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
