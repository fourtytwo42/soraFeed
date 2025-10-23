'use client';

import { useState, useCallback, useEffect } from 'react';
import { SoraFeedItem } from '@/types/sora';
import { CustomFeed, CustomFeedPlaybackState } from '@/types/customFeed';

export type FeedType = 'latest' | 'custom';

interface FeedLoaderProps {
  feedType: FeedType;
  selectedCustomFeed?: CustomFeed | null;
  formatFilter: string;
  onItemsChange: (items: SoraFeedItem[]) => void;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onCustomFeedPlaybackChange: (state: CustomFeedPlaybackState | null) => void;
  onVideoEvent?: (eventType: 'loadedmetadata' | 'ended', videoDuration?: number) => void;
}

export default function FeedLoader({
  feedType,
  selectedCustomFeed,
  formatFilter,
  onItemsChange,
  onLoadingChange,
  onErrorChange,
  onCustomFeedPlaybackChange,
  onVideoEvent
}: FeedLoaderProps) {
  const [items, setItems] = useState<SoraFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customFeedPlayback, setCustomFeedPlayback] = useState<CustomFeedPlaybackState | null>(null);
  const [currentFeed, setCurrentFeed] = useState<CustomFeed | null>(null);

  // Update parent components when state changes
  useEffect(() => {
    onItemsChange(items);
  }, [items, onItemsChange]);

  useEffect(() => {
    onLoadingChange(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    onErrorChange(error);
  }, [error, onErrorChange]);

  useEffect(() => {
    onCustomFeedPlaybackChange(customFeedPlayback);
  }, [customFeedPlayback, onCustomFeedPlaybackChange]);

  // Simple video fetching
  const fetchVideos = useCallback(async (searchQuery: string, limit: number = 20): Promise<SoraFeedItem[]> => {
    try {
      console.log(`📦 Fetching ${limit} videos for: "${searchQuery}"`);
      // videoMemoryCache removed - using direct API call
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=${limit}&format=${formatFilter}`);
      const data = await response.json();
      const videos = data.items || [];
      console.log(`✅ Got ${videos.length} videos for "${searchQuery}"`);
      return videos;
    } catch (err) {
      console.error(`❌ Failed to fetch videos for "${searchQuery}":`, err);
      return [];
    }
  }, [formatFilter]);

  // Load next block when needed
  const loadNextBlock = useCallback(async (feed: CustomFeed, currentBlockIndex: number) => {
    if (!feed.blocks || feed.blocks.length === 0) return [];
    
    if (currentBlockIndex + 1 >= feed.blocks.length) {
      if (feed.loop) {
        // Loop back to first block
        const firstBlock = feed.blocks[0];
        console.log(`🔄 Looping back to first block: "${firstBlock.searchQuery}"`);
        const blockVideos = await fetchVideos(firstBlock.searchQuery, 3);
        return blockVideos;
      }
      return [];
    }

    const nextBlock = feed.blocks[currentBlockIndex + 1];
    if (!nextBlock) return [];
    
    console.log(`📦 Loading next block: "${nextBlock.searchQuery}"`);
    const blockVideos = await fetchVideos(nextBlock.searchQuery, 3);
    console.log(`✅ Loaded ${blockVideos.length} videos from next block`);
    return blockVideos;
  }, [fetchVideos]);

  // Load latest feed
  const loadLatestFeed = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Loading latest feed...');
      
      const response = await fetch(`/api/feed/latest?limit=100&format=${formatFilter}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const videos = data.items || [];
      
      console.log(`✅ Loaded ${videos.length} latest videos`);
      
      setItems(videos);
      setError(null);
    } catch (err) {
      console.error('❌ Failed to load latest feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load latest feed');
      
      // Fallback to empty array in production
      if (process.env.NODE_ENV !== 'development') {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [formatFilter]);

  // Simple custom feed - pre-compile all blocks into one queue
  const startCustomFeed = useCallback(async (feed: CustomFeed) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`🎵 Starting custom feed: "${feed.name}" (${feed.blocks.length} blocks)`);
      
      if (!feed.blocks || feed.blocks.length === 0) {
        setError('Custom feed has no blocks');
        return;
      }

      // Load only the first block initially (maximum 3 videos)
      console.log('🧠 Loading first block only...');
      const allVideos: SoraFeedItem[] = [];
      
      if (feed.blocks.length > 0) {
        const firstBlock = feed.blocks[0];
        console.log(`📦 Loading first block: "${firstBlock.searchQuery}"`);
        // Load only 3 videos maximum from the first block
        const blockVideos = await fetchVideos(firstBlock.searchQuery, 3);
        allVideos.push(...blockVideos);
        console.log(`✅ Loaded ${blockVideos.length} videos from first block`);
      }

      console.log(`✅ Initial load complete: ${allVideos.length} videos (max 3)`);

      // Set up simple playback state
      setCustomFeedPlayback({
        currentBlockIndex: 0,
        blockStartTime: Date.now(),
        currentSearchQuery: feed.blocks[0]?.searchQuery || 'compiled',
        blockElapsedTime: 0,
        currentVideoStartTime: Date.now(),
        currentVideoDuration: 0,
      });

      // Store feed reference
      setCurrentFeed(feed);

      // Set initial videos
      setItems(allVideos);
      setError(null);
      
      console.log(`🎬 Custom feed ready with ${allVideos.length} videos`);
    } catch (err) {
      console.error('❌ Failed to start custom feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to start custom feed');
    } finally {
      setLoading(false);
    }
  }, [fetchVideos]);

  // Load more videos when user is near the end
  const loadMoreVideos = useCallback(async (currentIndex: number) => {
    if (!currentFeed || feedType !== 'custom' || !customFeedPlayback) return;

    // Load more when user is on the last video
    if (currentIndex >= items.length - 1) {
      console.log('📦 Loading more videos for custom feed...');
      
      try {
        const nextVideos = await loadNextBlock(currentFeed, customFeedPlayback.currentBlockIndex);
        
        if (nextVideos.length > 0) {
          setItems(prev => [...prev, ...nextVideos]);
          
          // Update playback state to next block
          setCustomFeedPlayback(prev => prev ? {
            ...prev,
            currentBlockIndex: (prev.currentBlockIndex + 1) % currentFeed.blocks.length,
            blockStartTime: Date.now(),
            currentSearchQuery: nextVideos[0] ? currentFeed.blocks[(prev.currentBlockIndex + 1) % currentFeed.blocks.length]?.searchQuery || 'compiled' : 'compiled'
          } : null);
          
          console.log(`✅ Added ${nextVideos.length} more videos to feed`);
        }
      } catch (err) {
        console.error('❌ Failed to load more videos:', err);
      }
    }
  }, [currentFeed, feedType, customFeedPlayback, items.length, loadNextBlock]);

  // Handle video events (simplified)
  const handleVideoEvent = useCallback((eventType: 'loadedmetadata' | 'ended', videoDuration?: number) => {
    if (feedType === 'custom' && customFeedPlayback && eventType === 'loadedmetadata' && videoDuration) {
      // Update playback state with video duration
      setCustomFeedPlayback(prev => prev ? {
        ...prev,
        currentVideoDuration: videoDuration,
        currentVideoStartTime: Date.now(),
      } : null);
    }
    
    // Pass event to parent
    if (onVideoEvent) {
      onVideoEvent(eventType, videoDuration);
    }
  }, [feedType, customFeedPlayback, onVideoEvent]);

  // Load feed based on type
  const loadFeed = useCallback(async (type: FeedType = feedType) => {
    if (type === 'latest') {
      await loadLatestFeed();
    } else if (type === 'custom' && selectedCustomFeed) {
      await startCustomFeed(selectedCustomFeed);
    }
  }, [feedType, selectedCustomFeed, loadLatestFeed, startCustomFeed]);

  // Auto-load when feed type or selected feed changes
  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Expose functions to parent
  useEffect(() => {
    // This is a bit of a hack to expose the functions to parent components
    // In a real app, you might use a ref or context
    (window as unknown as { feedLoaderVideoEvent?: typeof handleVideoEvent; feedLoaderLoadMore?: typeof loadMoreVideos }).feedLoaderVideoEvent = handleVideoEvent;
    (window as unknown as { feedLoaderVideoEvent?: typeof handleVideoEvent; feedLoaderLoadMore?: typeof loadMoreVideos }).feedLoaderLoadMore = loadMoreVideos;
    
    return () => {
      delete (window as unknown as { feedLoaderVideoEvent?: typeof handleVideoEvent; feedLoaderLoadMore?: typeof loadMoreVideos }).feedLoaderVideoEvent;
      delete (window as unknown as { feedLoaderVideoEvent?: typeof handleVideoEvent; feedLoaderLoadMore?: typeof loadMoreVideos }).feedLoaderLoadMore;
    };
  }, [handleVideoEvent, loadMoreVideos]);

  return null; // This component only manages state
}
