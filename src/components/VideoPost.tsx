'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Heart, Share, User, CheckCircle } from 'lucide-react';
import { SoraFeedItem } from '@/types/sora';

interface VideoPostProps {
  item: SoraFeedItem;
  isActive: boolean;
  onNext: () => void;
  onPrevious: () => void;
}

export default function VideoPost({ item, isActive }: VideoPostProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoUrl = item.post.attachments[0]?.encodings?.md?.path || 
                   item.post.attachments[0]?.encodings?.source?.path;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

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
      className="relative w-full h-full flex items-center justify-center bg-black group cursor-pointer"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={() => setShowControls(!showControls)}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="max-w-full max-h-full object-contain"
        loop
        muted={isMuted}
        playsInline
        onEnded={handleVideoEnd}
        poster={item.post.attachments[0]?.encodings?.thumbnail?.path}
      >
        {videoUrl && <source src={videoUrl} type="video/mp4" />}
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

      {/* Controls */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ 
          opacity: showControls ? 1 : 0,
          y: showControls ? 0 : 20
        }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-4 left-4 right-20 z-10"
      >
        {/* User Info */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <User size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">
                {item.profile.display_name || item.profile.username}
              </span>
              {item.profile.verified && (
                <CheckCircle size={16} className="text-blue-500" />
              )}
              <span className="text-white/70 text-sm">
                {formatTimeAgo(item.post.posted_at)}
              </span>
            </div>
            <div className="text-white/70 text-sm">
              {formatCount(item.profile.follower_count)} followers
            </div>
          </div>
        </div>

        {/* Caption */}
        {item.post.text && (
          <p className="text-white text-sm mb-2 line-clamp-3">
            {item.post.text}
          </p>
        )}
      </motion.div>

      {/* Right Side Actions */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ 
          opacity: showControls ? 1 : 0,
          x: showControls ? 0 : 20
        }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-4 right-4 flex flex-col gap-4 z-10"
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
      </motion.div>

      {/* Top Controls */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ 
          opacity: showControls ? 1 : 0,
          y: showControls ? 0 : -20
        }}
        transition={{ duration: 0.2 }}
        className="absolute top-4 right-4 z-10"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePlayPause();
          }}
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </motion.div>
    </div>
  );
}
