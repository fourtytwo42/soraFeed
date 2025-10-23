'use client';

import { useState, useEffect, useMemo } from 'react';
import { CustomFeed } from '@/types/customFeed';

interface TimelineSegment {
  blockIndex: number;
  searchQuery: string;
  startVideoIndex: number; // video index where this block starts
  videoCount: number; // number of videos in this block
  color: string;
}

interface CustomFeedTimelineProps {
  feed: CustomFeed | null;
  currentVideoIndex: number; // Current video index in the queue
  totalVideos: number; // Total number of videos in timeline
  videoProgress: number; // Progress within current video (0-1)
  blockPositions: number[]; // Actual positions where each block starts in the queue
  isVisible: boolean;
}

// Generate consistent colors for search terms
const generateColor = (searchQuery: string): string => {
  let hash = 0;
  for (let i = 0; i < searchQuery.length; i++) {
    hash = searchQuery.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

export default function CustomFeedTimeline({ 
  feed, 
  currentVideoIndex, 
  totalVideos, 
  videoProgress,
  blockPositions,
  isVisible 
}: CustomFeedTimelineProps) {
  const [segments, setSegments] = useState<TimelineSegment[]>([]);

  // Calculate timeline segments - always use planned proportions for visual consistency
  const timelineSegments = useMemo(() => {
    if (!feed || !feed.blocks.length) return [];

    const segments: TimelineSegment[] = [];
    let plannedStartIndex = 0;

    feed.blocks.forEach((block, index) => {
      // Always use planned positions for consistent visual layout
      // The actual positions are only used for determining which segment is active
      segments.push({
        blockIndex: index,
        searchQuery: block.searchQuery,
        startVideoIndex: plannedStartIndex,
        videoCount: block.videoCount, // Always use planned video count for proportions
        color: generateColor(block.searchQuery)
      });

      plannedStartIndex += block.videoCount;
    });

    return segments;
  }, [feed]); // Remove blockPositions and totalVideos from dependencies to prevent resizing

  // Update segments when feed changes
  useEffect(() => {
    setSegments(timelineSegments);
  }, [timelineSegments]);

  // Calculate current position percentage (including progress within current video)
  const currentPositionWithProgress = currentVideoIndex + videoProgress;
  const totalPlannedVideos = feed ? feed.blocks.reduce((sum, block) => sum + block.videoCount, 0) : totalVideos;
  const progressPercentage = totalPlannedVideos > 0 ? (currentPositionWithProgress / totalPlannedVideos) * 100 : 0;

  // Find current active segment using actual block positions
  const activeSegment = useMemo(() => {
    if (!segments.length || blockPositions.length === 0) return null;
    
    // Find which block the current video index falls into using actual positions
    for (let i = 0; i < blockPositions.length; i++) {
      const blockStart = blockPositions[i];
      const blockEnd = i + 1 < blockPositions.length ? blockPositions[i + 1] : totalVideos;
      
      if (currentVideoIndex >= blockStart && currentVideoIndex < blockEnd) {
        return segments.find(seg => seg.blockIndex === i) || null;
      }
    }
    
    return null;
  }, [segments, blockPositions, currentVideoIndex, totalVideos]);

  // Debug logging for header sync issues
  if (process.env.NODE_ENV === 'development') {
    console.log('🎯 Timeline Debug:', {
      currentVideoIndex,
      totalVideos,
      blockPositions,
      segments: segments.map(s => ({
        blockIndex: s.blockIndex,
        searchQuery: s.searchQuery,
        startVideoIndex: s.startVideoIndex,
        videoCount: s.videoCount,
        range: `${s.startVideoIndex}-${s.startVideoIndex + s.videoCount - 1}`,
        widthPercent: totalVideos > 0 ? (s.videoCount / totalVideos) * 100 : 0,
        leftPercent: totalVideos > 0 ? (s.startVideoIndex / totalVideos) * 100 : 0
      })),
      activeSegment: activeSegment ? {
        blockIndex: activeSegment.blockIndex,
        searchQuery: activeSegment.searchQuery,
        range: `${activeSegment.startVideoIndex}-${activeSegment.startVideoIndex + activeSegment.videoCount - 1}`
      } : null
    });
  }

  if (!isVisible || !feed || segments.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg max-w-4xl w-full mx-4">
      <div className="flex flex-col gap-2">
        {/* Timeline Bar */}
        <div className="relative h-6 bg-gray-700 rounded-full overflow-hidden">
          {/* Segments */}
          {segments.map((segment, index) => {
            // Calculate total planned videos for proper proportions
            const totalPlannedVideos = feed ? feed.blocks.reduce((sum, block) => sum + block.videoCount, 0) : totalVideos;
            const segmentWidth = totalPlannedVideos > 0 ? (segment.videoCount / totalPlannedVideos) * 100 : 0;
            const segmentLeft = totalPlannedVideos > 0 ? (segment.startVideoIndex / totalPlannedVideos) * 100 : 0;
            const isLoaded = segment.blockIndex < blockPositions.length && blockPositions[segment.blockIndex] !== undefined;
            const isActive = activeSegment?.blockIndex === segment.blockIndex;
            
            return (
              <div
                key={`${segment.blockIndex}-${segment.searchQuery}`}
                className="absolute top-0 h-full transition-all duration-300"
                style={{
                  left: `${segmentLeft}%`,
                  width: `${segmentWidth}%`,
                  backgroundColor: segment.color,
                  opacity: isActive ? 1 : (isLoaded ? 0.7 : 0.3), // Dimmer for unloaded blocks
                  border: isLoaded ? 'none' : '1px dashed rgba(255,255,255,0.3)' // Dashed border for unloaded
                }}
              />
            );
          })}
          
          {/* Progress Indicator */}
          <div 
            className="absolute top-0 w-1 h-full bg-white shadow-lg transition-all duration-300 ease-out"
            style={{ left: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>

        {/* Labels */}
        <div className="relative h-4">
          {segments.map((segment, index) => {
            const segmentWidth = totalVideos > 0 ? (segment.videoCount / totalVideos) * 100 : 0;
            const segmentLeft = totalVideos > 0 ? (segment.startVideoIndex / totalVideos) * 100 : 0;
            
            // Only show label if segment is wide enough
            const showLabel = segmentWidth > 15;
            
            return showLabel ? (
              <div
                key={`label-${segment.blockIndex}-${segment.searchQuery}`}
                className="absolute text-xs font-medium text-white truncate px-1"
                style={{
                  left: `${segmentLeft}%`,
                  width: `${segmentWidth}%`,
                  color: activeSegment?.blockIndex === segment.blockIndex ? segment.color : 'rgba(255,255,255,0.8)'
                }}
              >
                {segment.searchQuery}
              </div>
            ) : null;
          })}
        </div>

        {/* Current Info */}
        {activeSegment && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 text-white">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activeSegment.color }}
              />
              <span className="text-sm font-medium">
                {activeSegment.searchQuery}
              </span>
              <span className="text-xs opacity-75">
                Block {activeSegment.blockIndex + 1}/{segments.length}
              </span>
              {feed.loop && (
                <span className="text-xs opacity-75">• Looping</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
