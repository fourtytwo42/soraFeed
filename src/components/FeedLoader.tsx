'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SoraFeedItem } from '@/types/sora';
import { fetchFeed } from '@/lib/api';
import { remixCache } from '@/lib/remixCache';
import VerticalCarousel from './VerticalCarousel';
import RemixCacheDebug from './RemixCacheDebug';
import { mockFeedData } from '@/lib/mockData';
import { ChevronDown, Plus, Edit2, X as XIcon, Pin } from 'lucide-react';
import CustomFeedBuilder from './CustomFeedBuilder';
import CustomFeedTimeline from './CustomFeedTimeline';
import { CustomFeed, CustomFeedPlaybackState, BlockQueue, VideoQueue, CustomFeedTimelineState } from '@/types/customFeed';
import { customFeedStorage } from '@/lib/customFeedStorage';
import { videoTracker } from '@/lib/videoTracker';
// Import debug utilities in development
if (process.env.NODE_ENV === 'development') {
  import('@/lib/videoTrackerDebug');
}

type FeedType = 'latest' | 'top' | 'favorites' | 'search' | 'custom';

// Helper functions for localStorage persistence
const getStoredFormatFilter = (): 'both' | 'tall' | 'wide' => {
  if (typeof window === 'undefined') return 'both';
  try {
    const stored = localStorage.getItem('soraFeedFormatFilter');
    if (stored && ['both', 'tall', 'wide'].includes(stored)) {
      return stored as 'both' | 'tall' | 'wide';
    }
  } catch (error) {
    console.error('Error loading format filter from localStorage:', error);
  }
  return 'both';
};

const getStoredFeedType = (): FeedType => {
  if (typeof window === 'undefined') return 'latest';
  try {
    const stored = localStorage.getItem('soraFeedType');
    if (stored && ['latest', 'top', 'favorites', 'search', 'custom'].includes(stored)) {
      return stored as FeedType;
    }
  } catch (error) {
    console.error('Error loading feed type from localStorage:', error);
  }
  return 'latest';
};

const saveFormatFilter = (filter: 'both' | 'tall' | 'wide') => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('soraFeedFormatFilter', filter);
  } catch (error) {
    console.error('Error saving format filter to localStorage:', error);
  }
};

const saveFeedType = (type: FeedType) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('soraFeedType', type);
  } catch (error) {
    console.error('Error saving feed type to localStorage:', error);
  }
};

const getStoredSelectedCustomFeedId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('soraSelectedCustomFeedId');
  } catch (error) {
    console.error('Error loading selected custom feed ID from localStorage:', error);
    return null;
  }
};

const saveSelectedCustomFeedId = (feedId: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (feedId) {
      localStorage.setItem('soraSelectedCustomFeedId', feedId);
    } else {
      localStorage.removeItem('soraSelectedCustomFeedId');
    }
  } catch (error) {
    console.error('Error saving selected custom feed ID to localStorage:', error);
  }
};

// Block indicator pin state management
const getStoredBlockIndicatorPinned = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem('soraBlockIndicatorPinned');
    return stored === 'true';
  } catch (error) {
    console.error('Failed to get stored block indicator pin state:', error);
    return false;
  }
};

const saveBlockIndicatorPinned = (pinned: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('soraBlockIndicatorPinned', pinned.toString());
  } catch (error) {
    console.error('Failed to save block indicator pin state:', error);
  }
};

export default function FeedLoader() {
  const [items, setItems] = useState<SoraFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedType, setFeedType] = useState<FeedType>(() => getStoredFeedType());
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [blockIndicatorPinned, setBlockIndicatorPinned] = useState<boolean>(() => getStoredBlockIndicatorPinned());
  const [formatFilter, setFormatFilter] = useState<'both' | 'tall' | 'wide'>(() => getStoredFormatFilter());
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Custom feed state
  const [customFeeds, setCustomFeeds] = useState<CustomFeed[]>([]);
  const [selectedCustomFeed, setSelectedCustomFeed] = useState<CustomFeed | null>(null);
  const [customFeedPlayback, setCustomFeedPlayback] = useState<CustomFeedPlaybackState | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<CustomFeed | null>(null);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Video queue for custom feeds
  const [videoQueue, setVideoQueue] = useState<VideoQueue>({ videos: [], currentIndex: 0, isLoading: false, lastBlockIndex: -1, blockPositions: [] });
  
  // Timeline state for custom feeds
  const [timelineState, setTimelineState] = useState<CustomFeedTimelineState>({ totalVideos: 0, currentVideoIndex: 0, currentBlockIndex: 0, videoProgress: 0 });
  const [blockQueue, setBlockQueue] = useState<Map<number, BlockQueue>>(new Map());
  const prefetchTimerRef = useRef<NodeJS.Timeout | null>(null);
  

  // Wrapper functions to save to localStorage when state changes
  const updateFeedType = useCallback((newType: FeedType) => {
    setFeedType(newType);
    saveFeedType(newType);
  }, []);

  const updateFormatFilter = useCallback((newFilter: 'both' | 'tall' | 'wide') => {
    setFormatFilter(newFilter);
    saveFormatFilter(newFilter);
  }, []);

  const updateSelectedCustomFeed = useCallback((feed: CustomFeed | null) => {
    setSelectedCustomFeed(feed);
    saveSelectedCustomFeedId(feed?.id || null);
  }, []);

  const toggleBlockIndicatorPin = useCallback(() => {
    const newPinned = !blockIndicatorPinned;
    setBlockIndicatorPinned(newPinned);
    saveBlockIndicatorPinned(newPinned);
  }, [blockIndicatorPinned]);

  // Format filter function
  const filterItemsByFormat = useCallback((items: SoraFeedItem[]): SoraFeedItem[] => {
    if (formatFilter === 'both') return items;
    
    return items.filter(item => {
      const attachment = item.post.attachments[0];
      if (!attachment || !attachment.width || !attachment.height) return true;
      
      const isWide = attachment.width > attachment.height;
      const isTall = attachment.height > attachment.width;
      
      if (formatFilter === 'wide') return isWide;
      if (formatFilter === 'tall') return isTall;
      return true;
    });
  }, [formatFilter]);

  // Favorites management
  const getFavorites = (): SoraFeedItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('soraFeedFavorites');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading favorites:', error);
      return [];
    }
  };

  const saveFavorites = (favorites: SoraFeedItem[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('soraFeedFavorites', JSON.stringify(favorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  const addToFavorites = (item: SoraFeedItem) => {
    const favorites = getFavorites();
    const isAlreadyFavorite = favorites.some(fav => fav.post.id === item.post.id);
    if (!isAlreadyFavorite) {
      const newFavorites = [...favorites, item];
      saveFavorites(newFavorites);
      // If currently viewing favorites, update the feed
      if (feedType === 'favorites') {
        setItems(newFavorites);
      }
    }
  };

  const removeFromFavorites = (postId: string) => {
    const favorites = getFavorites();
    const newFavorites = favorites.filter(fav => fav.post.id !== postId);
    saveFavorites(newFavorites);
    // If currently viewing favorites, update the feed
    if (feedType === 'favorites') {
      setItems(newFavorites);
    }
  };

  const isInFavorites = (postId: string): boolean => {
    const favorites = getFavorites();
    return favorites.some(fav => fav.post.id === postId);
  };

  // Custom feed management
  const loadCustomFeeds = useCallback(() => {
    const feeds = customFeedStorage.getAll();
    setCustomFeeds(feeds);
  }, []);

  const handleSaveCustomFeed = (feed: CustomFeed) => {
    customFeedStorage.save(feed);
    loadCustomFeeds();
    
    // If we're editing the currently selected feed, update it
    if (selectedCustomFeed && selectedCustomFeed.id === feed.id) {
      updateSelectedCustomFeed(feed);
      // Restart playback with updated feed - will be handled by useEffect
    }
  };

  const handleDeleteCustomFeed = useCallback((feedId: string) => {
    if (confirm('Are you sure you want to delete this custom feed?')) {
      customFeedStorage.delete(feedId);
      loadCustomFeeds();
      
      // If we deleted the currently selected feed, reset
      if (selectedCustomFeed && selectedCustomFeed.id === feedId) {
        updateSelectedCustomFeed(null);
        setCustomFeedPlayback(null);
        if (feedType === 'custom') {
          // Clear timer and switch to latest
          if (playbackTimerRef.current) {
            clearTimeout(playbackTimerRef.current);
            playbackTimerRef.current = null;
          }
          updateFeedType('latest');
          setIsDropdownOpen(false);
          // Note: loadFeed will be called automatically when feedType changes
        }
      }
    }
  }, [selectedCustomFeed, feedType, loadCustomFeeds, updateFeedType, updateSelectedCustomFeed]);

  const handleEditCustomFeed = useCallback((feed: CustomFeed) => {
    setEditingFeed(feed);
    setIsBuilderOpen(true);
  }, []);

  const handleCreateNewFeed = useCallback(() => {
    setEditingFeed(null);
    setIsBuilderOpen(true);
  }, []);

  // Prefetch videos for a specific block with TRUE RANDOMIZATION
  const prefetchBlockVideos = useCallback(async (blockIndex: number, searchQuery: string, videoCount = 20, retryCount = 0): Promise<SoraFeedItem[]> => {
    try {
      console.log(`🔄 Prefetching block ${blockIndex}: "${searchQuery}" (attempt ${retryCount + 1})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`⏱️ Request timeout for block ${blockIndex}: "${searchQuery}"`);
        controller.abort();
      }, 10000); // Increased timeout to 10 seconds
      
      // Add timestamp to ensure different results each time
      const timestamp = Date.now();
      
      // Fetch videos directly from server (server handles randomization now)
      const fetchLimit = videoCount; // Use calculated video count based on block duration
      console.log(`🔍 Custom feed search: "${searchQuery}" (limit: ${fetchLimit}, format: ${formatFilter})`);
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=${fetchLimit}&fast=true&t=${timestamp}&format=${formatFilter}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Prefetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      let videos = data.items || [];
      
      console.log(`📦 Received ${videos.length} videos from server for "${searchQuery}" (server-randomized)`);
      
      // Debug: Log the actual video descriptions to verify they match the search
      if (videos.length > 0) {
        console.log(`🔍 Sample video descriptions for "${searchQuery}":`);
        videos.slice(0, 3).forEach((video: SoraFeedItem, i: number) => {
          console.log(`   ${i + 1}. "${video.post.text}" (ID: ${video.post.id})`);
        });
      }
      
      // If no results and this is the first attempt, retry after a short delay
      if (videos.length === 0 && retryCount === 0) {
        console.log(`🔄 No results for "${searchQuery}" on first attempt, retrying in 1s...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await prefetchBlockVideos(blockIndex, searchQuery, videoCount, retryCount + 1);
      }
      
      // If still no results after retry, try a broader search
      if (videos.length === 0 && retryCount === 1) {
        console.log(`🔄 Still no results for "${searchQuery}", trying broader search...`);
        const broaderQuery = searchQuery.split(' ')[0]; // Use just the first word
        if (broaderQuery !== searchQuery) {
          const broaderResponse = await fetch(`/api/search?q=${encodeURIComponent(broaderQuery)}&limit=${fetchLimit}&fast=true&t=${timestamp + 1}&format=${formatFilter}`, {
            signal: controller.signal
          });
          if (broaderResponse.ok) {
            const broaderData = await broaderResponse.json();
            const broaderVideos = broaderData.items || [];
            if (broaderVideos.length > 0) {
              console.log(`✅ Found ${broaderVideos.length} results with broader search: "${broaderQuery}"`);
              videos = broaderVideos; // Use server-provided results directly
            }
          }
        }
      }
      
      // Use video tracker to filter out seen videos
      const unseenVideos: SoraFeedItem[] = videoTracker.filterUnseen(videos);
      const unseenCount = unseenVideos.length;
      const totalCount = videos.length;
      
      console.log(`📊 Video analysis for "${searchQuery}": ${totalCount} total, ${unseenCount} unseen, ${totalCount - unseenCount} already seen`);
      
      // If we have less than expected videos, we can fetch more if needed
      if (unseenCount < Math.min(3, videos.length) && videos.length > 0) {
        console.log(`⚠️ Low unseen video count (${unseenCount}), fetching more videos...`);
        try {
          // Try to get more videos (server will provide different randomized results)
          const moreResponse = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=${fetchLimit}&fast=true&t=${timestamp + 2}&format=${formatFilter}`, {
            signal: controller.signal
          });
          if (moreResponse.ok) {
            const moreData = await moreResponse.json();
            const moreVideos: SoraFeedItem[] = moreData.items || [];
            
            if (moreVideos.length > 0) {
              const moreUnseen: SoraFeedItem[] = videoTracker.filterUnseen(moreVideos);
              
              // Add the new unseen videos
              unseenVideos.push(...moreUnseen);
              console.log(`📈 Fetched ${moreVideos.length} additional results, ${moreUnseen.length} were unseen`);
            }
          }
        } catch (moreErr) {
          console.warn('Failed to fetch additional videos:', moreErr);
        }
      }
      
      // Use unseen videos if we have enough, otherwise mix in some seen ones
      let videosToUse: SoraFeedItem[];
      const targetCount = Math.min(videoCount, videos.length); // Use up to the requested video count
      
      if (unseenVideos.length >= targetCount) {
        videosToUse = unseenVideos.slice(0, targetCount);
      } else if (unseenVideos.length > 0) {
        // Mix unseen with some seen videos, prioritizing unseen
        const seenVideos = videos.filter((v: SoraFeedItem) => videoTracker.hasSeen(v.post.id));
        videosToUse = [...unseenVideos, ...seenVideos.slice(0, Math.max(0, targetCount - unseenVideos.length))];
      } else {
        // All videos are seen, use them anyway (server randomization provides variety)
        videosToUse = videos.slice(0, targetCount);
        console.log(`🔄 All videos seen for "${searchQuery}", using server-randomized results`);
      }

      // We now use exact video counts, so no need for duration validation
      
      // No client-side shuffling needed - server provides randomized results
      const finalVideos = videosToUse;
      
      // Mark the videos we're returning as seen
      const videoIds = finalVideos.map(video => video.post.id).filter(Boolean);
      videoTracker.markMultipleAsSeen(videoIds);
      
      console.log(`✅ Prefetched ${finalVideos.length} videos for block ${blockIndex} (${unseenCount} were unseen)`);
      
      // Log video tracker stats periodically
      const stats = videoTracker.getStats();
      if (stats.total % 50 === 0 && stats.total > 0) {
        console.log(`📊 Video tracker stats: ${stats.total} videos tracked`);
      }
      
      return finalVideos;
    } catch (err) {
      // Handle different types of errors more gracefully
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`⏱️ Request aborted for block ${blockIndex}: "${searchQuery}" (likely timeout)`);
      } else {
        console.error(`❌ Failed to prefetch block ${blockIndex} for "${searchQuery}":`, err);
        console.error(`❌ Error details:`, err instanceof Error ? err.message : err);
      }
      
      // Return empty array but don't crash the app
      return [];
    }
  }, [formatFilter]);

  // Add block to queue with prefetched videos
  const queueBlock = useCallback(async (blockIndex: number, searchQuery: string) => {
    // Don't queue if already exists and not expired
    const existing = blockQueue.get(blockIndex);
    if (existing && !existing.isLoading && (Date.now() - existing.loadedAt) < 300000) { // 5 min cache
      return;
    }

    // Mark as loading
    setBlockQueue(prev => new Map(prev.set(blockIndex, {
      blockIndex,
      searchQuery,
      videos: existing?.videos || [],
      isLoading: true,
      loadedAt: existing?.loadedAt || 0
    })));

    // Fetch videos
    const videos = await prefetchBlockVideos(blockIndex, searchQuery, 20);
    
    // Update with results
    setBlockQueue(prev => new Map(prev.set(blockIndex, {
      blockIndex,
      searchQuery,
      videos,
      isLoading: false,
      loadedAt: Date.now()
    })));

    // ALSO PRELOAD THE ACTUAL VIDEO FILES for seamless playback
    if (videos.length > 0) {
      console.log(`🎬 Starting video file preload for block ${blockIndex} (${videos.length} videos)`);
      videos.forEach((video, index) => {
        if (video.post?.attachments?.[0]?.encodings?.source?.path) {
          // Import videoPreloadManager dynamically to avoid circular imports
          import('@/lib/videoPreloadManager').then(({ videoPreloadManager }) => {
            videoPreloadManager.requestPreload({
              videoUrl: video.post.attachments[0].encodings.source!.path,
              postId: video.post.id,
              priority: blockIndex === 0 ? 1 : 2 + blockIndex, // Higher priority for earlier blocks
              onSuccess: () => {
                console.log(`✅ Video file preloaded for block ${blockIndex}, video ${index}: ${video.post.id}`);
              },
              onError: (error) => {
                console.warn(`⚠️ Video file preload failed for block ${blockIndex}, video ${index}:`, error.message);
              }
            });
          });
        }
      });
    }
  }, [blockQueue, prefetchBlockVideos]);

  // Simple function to get videos for a block - just use the video count directly
  const getVideosForBlock = useCallback((videoCount: number): number => {
    // Ensure reasonable limits
    return Math.max(1, Math.min(50, videoCount));
  }, []);

  // Estimate video duration (will be updated with actual duration when video loads)
  const estimateVideoDuration = useCallback((video: any): number => {
    // Try to get duration from video metadata if available
    // Otherwise use average of 15 seconds with some randomness (10-20 seconds)
    return 15 + Math.random() * 10; // 15-25 seconds
  }, []);

  // Calculate total videos in timeline from feed blocks
  const calculateTotalVideos = useCallback((feed: CustomFeed): number => {
    return feed.blocks.reduce((total, block) => total + block.videoCount, 0);
  }, []);

  // Add videos from a timeblock to the queue
  const addBlockToQueue = useCallback(async (feed: CustomFeed, blockIndex: number): Promise<void> => {
    if (blockIndex >= feed.blocks.length) return;
    
    const block = feed.blocks[blockIndex];
    const videosNeeded = getVideosForBlock(block.videoCount);
    
    console.log(`📦 Adding block ${blockIndex} to queue: "${block.searchQuery}" (${block.videoCount} videos needed)`);
    
    setVideoQueue(prev => ({ ...prev, isLoading: true }));
    
    try {
      // Fetch the calculated number of videos for this block's duration
      const blockVideos = await prefetchBlockVideos(blockIndex, block.searchQuery, videosNeeded);
      
      if (blockVideos.length === 0) {
        console.warn(`⚠️ No videos fetched for block ${blockIndex}: "${block.searchQuery}"`);
        setVideoQueue(prev => ({ ...prev, isLoading: false }));
        return;
      }
      
      setVideoQueue(prev => {
        // Deduplicate new videos against existing queue
        const existingIds = new Set((prev.videos as SoraFeedItem[]).map(video => video.post.id));
        const uniqueBlockVideos = blockVideos.filter((video: SoraFeedItem) => !existingIds.has(video.post.id));
        
        const newBlockPositions = [...prev.blockPositions];
        newBlockPositions[blockIndex] = prev.videos.length; // Record where this block starts
        
        const newQueue = {
          ...prev,
          videos: [...prev.videos, ...uniqueBlockVideos],
          isLoading: false,
          lastBlockIndex: blockIndex,
          blockPositions: newBlockPositions
        };
        console.log(`✅ Added ${uniqueBlockVideos.length}/${blockVideos.length} unique videos from block ${blockIndex} to queue (${blockVideos.length - uniqueBlockVideos.length} duplicates filtered, total: ${newQueue.videos.length})`);
        console.log(`📍 Block ${blockIndex} starts at position ${newBlockPositions[blockIndex]}`);
        return newQueue;
      });
    } catch (error) {
      console.error(`❌ Failed to add block ${blockIndex} to queue:`, error);
      setVideoQueue(prev => ({ ...prev, isLoading: false }));
    }
  }, [prefetchBlockVideos, getVideosForBlock]);

  // Ensure queue has enough videos (minimum 20)
  const ensureQueueSize = useCallback(async (feed: CustomFeed): Promise<void> => {
    const remainingVideos = videoQueue.videos.length - videoQueue.currentIndex;
    
    if (remainingVideos < 20 && !videoQueue.isLoading) {
      console.log(`📊 Queue has ${remainingVideos} remaining videos, adding more...`);
      
      // Find next block to add
      let nextBlockIndex = videoQueue.lastBlockIndex + 1;
      
      // Handle looping
      if (nextBlockIndex >= feed.blocks.length) {
        if (feed.loop) {
          nextBlockIndex = 0;
          console.log('🔄 Looping back to block 0 for queue refill');
            } else {
          console.log('🏁 Reached end of feed, no more blocks to add');
          return;
        }
      }
      
      await addBlockToQueue(feed, nextBlockIndex);
    }
  }, [videoQueue, addBlockToQueue]);


  // Get current videos from queue for display
  const getQueueVideos = useCallback((): SoraFeedItem[] => {
    const remainingVideos = videoQueue.videos.slice(videoQueue.currentIndex);
    return remainingVideos.slice(0, 20) as SoraFeedItem[]; // Show up to 20 videos at a time
  }, [videoQueue]);

  const loadCustomFeedBlock = useCallback(async (blockIndex: number, searchQuery: string) => {
    // Update display and advance queue position for block transitions
    try {
      setError(null);
      
      console.log(`🎬 Transitioning to block ${blockIndex}: "${searchQuery}"`);
      
      // For block transitions, use the actual block positions
      // Get the starting position of this block from our tracked positions
      const targetIndex = videoQueue.blockPositions[blockIndex] || 0;
      
      console.log(`📍 Transitioning to block ${blockIndex} at queue position ${targetIndex}`);
      console.log(`📊 Block positions:`, videoQueue.blockPositions);
      
      // Update queue index to the target position
      setVideoQueue(prev => ({
        ...prev,
        currentIndex: Math.min(targetIndex, Math.max(0, prev.videos.length - 20)) // Ensure we don't go past available videos
      }));
      
      // Get videos from the new position
      setTimeout(() => {
        const queueVideos = getQueueVideos();
        
        if (queueVideos.length > 0) {
          console.log(`🎬 Block transition: showing ${queueVideos.length} videos from queue position ${targetIndex}`);
          setItems(queueVideos);
          setError(null);
          console.log(`✅ Block ${blockIndex} display updated with ${queueVideos.length} videos`);
          
          // Debug: Log what videos are being displayed after block transition
          console.log(`🎭 Videos now showing after block ${blockIndex} transition:`);
          queueVideos.slice(0, 3).forEach((video, i) => {
            console.log(`   ${i + 1}. "${video.post.text}" (ID: ${video.post.id})`);
          });
        } else {
          console.warn(`⚠️ No videos available at queue position ${targetIndex} for block ${blockIndex}`);
          // Don't set error - keep showing current videos
        }
      }, 50); // Small delay to ensure state update is processed
      
      setCursor(null);
      setHasMore(true); // Enable scrolling within the block
    } catch (err) {
      console.error(`❌ Block transition error for block ${blockIndex}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to transition to next block');
    }
  }, [getQueueVideos]);


  // Start prefetching next blocks during current block playback
  const startPrefetching = useCallback((feed: CustomFeed, currentIndex: number) => {
    // Clear any existing prefetch timer
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
    }

    // Only prefetch the next block, not multiple blocks at once
    const nextBlockIndex = currentIndex + 1;
    if (nextBlockIndex < feed.blocks.length) {
      console.log(`🚀 Prefetching next block ${nextBlockIndex} for seamless transition`);
      
      // Add a delay to avoid overwhelming the server
      prefetchTimerRef.current = setTimeout(() => {
        addBlockToQueue(feed, nextBlockIndex);
      }, 1000); // 1 second delay
    }

    // If looping, prefetch beginning blocks when approaching the end
    if (feed.loop) {
      const blocksFromEnd = feed.blocks.length - currentIndex;
      
      // Start preloading loop content when we're 1 block from the end
      if (blocksFromEnd <= 2) {
        console.log(`🔄 Preloading loop content (${blocksFromEnd} blocks from end)`);
        
        // Only preload the first block for loop transition
        if (feed.blocks.length > 0) {
          console.log(`📦 Preloading loop block 0: "${feed.blocks[0].searchQuery}"`);
          prefetchTimerRef.current = setTimeout(() => {
            addBlockToQueue(feed, 0);
          }, 2000); // 2 second delay for loop preloading
        }
      }
    }
  }, [addBlockToQueue]);

  // Execute the actual block transition logic
  const executeBlockTransition = useCallback((feed: CustomFeed, currentIndex: number, nextIndex: number): void => {
    const nextBlock = feed.blocks[nextIndex];
    console.log(`🔄 Executing block transition from ${currentIndex} to ${nextIndex}`);
    console.log(`🎯 Now playing Block ${nextIndex}: "${nextBlock?.searchQuery}" (${nextBlock?.videoCount} videos)`);
    
    // Update timeline state
    setTimelineState(prev => ({
      ...prev,
      currentBlockIndex: nextIndex
    }));
    
    // Update display from queue
    loadCustomFeedBlock(nextIndex, nextBlock?.searchQuery || '');
    
    // Only prefetch the next block if we're not at the end
    if (nextIndex + 1 < feed.blocks.length) {
      // Prefetch next block with a delay to avoid overwhelming the server
      setTimeout(() => {
        addBlockToQueue(feed, nextIndex + 1);
      }, 1500);
    }
  }, [loadCustomFeedBlock, addBlockToQueue]);

  // Track video progress within blocks for video-count-based transitions
  const checkBlockProgress = useCallback((feed: CustomFeed) => {
    if (!feed || videoQueue.videos.length === 0) return;

    const currentVideoIndex = videoQueue.currentIndex;
    const currentBlockIndex = timelineState.currentBlockIndex;
    const currentBlock = feed.blocks[currentBlockIndex];
    
    if (!currentBlock) return;

    // Find where this block starts in the queue
    const blockStartIndex = videoQueue.blockPositions[currentBlockIndex] || 0;
    const videosWatchedInBlock = currentVideoIndex - blockStartIndex;
    
    console.log(`📊 Block progress: ${videosWatchedInBlock}/${currentBlock.videoCount} videos watched in block ${currentBlockIndex}`);
    
    // Check if we've watched enough videos in this block
    if (videosWatchedInBlock >= currentBlock.videoCount) {
      const nextBlockIndex = currentBlockIndex + 1;
      
      if (nextBlockIndex >= feed.blocks.length) {
        // End of timeline
        if (feed.loop) {
          console.log(`🔄 Timeline completed, looping back to block 0`);
          executeBlockTransition(feed, currentBlockIndex, 0);
        } else {
          console.log(`🏁 Timeline completed, no loop - switching to regular feed`);
          // Switch back to regular feed
          setFeedType('latest');
          return;
        }
      } else {
        console.log(`🔄 Block ${currentBlockIndex} completed (${videosWatchedInBlock} videos), moving to block ${nextBlockIndex}`);
        executeBlockTransition(feed, currentBlockIndex, nextBlockIndex);
      }
    }
  }, [videoQueue, timelineState, executeBlockTransition]);

  // Initialize block tracking (replaces scheduleNextBlock)
  const initializeBlockTracking = useCallback((feed: CustomFeed, startingBlockIndex: number) => {
    console.log(`🎯 Initializing block tracking for "${feed.name}" starting at block ${startingBlockIndex}`);
    
    // Start prefetching for upcoming blocks
    startPrefetching(feed, startingBlockIndex);
    
    // Update timeline state
    setTimelineState(prev => ({
      ...prev,
      currentBlockIndex: startingBlockIndex
    }));
  }, [startPrefetching]);

  const startCustomFeedPlayback = useCallback(async (feed: CustomFeed) => {
    console.log(`🎵 Starting custom feed playback: "${feed.name}" (${feed.blocks.length} blocks, loop: ${feed.loop})`);
    console.log('🎵 Feed blocks:', feed.blocks.map((b, i) => `Block ${i}: "${b.searchQuery}" (${b.videoCount} videos)`));
    console.log('🎵 Full feed configuration:', JSON.stringify(feed, null, 2));
    
    // Clear any existing timer and reset waiting state
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      console.log('🧹 Cleared existing playback timer');
    }
    
    // Reset video waiting state
    waitingForVideoEndRef.current = false;
    pendingBlockTransitionRef.current = null;

    if (!feed.blocks || feed.blocks.length === 0) {
      console.error('❌ Cannot start playback: feed has no blocks');
      setError('Custom feed has no blocks');
      return;
    }

    // Initialize playback state
    const initialState: CustomFeedPlaybackState = {
      currentBlockIndex: 0,
      blockStartVideoIndex: 0,
      currentSearchQuery: feed.blocks[0]?.searchQuery || '',
      blockElapsedVideos: 0,
      currentVideoIndex: 0,
      totalVideosInBlock: feed.blocks[0]?.videoCount || 0,
    };

    console.log(`▶️ Starting block 0: "${feed.blocks[0].searchQuery}" (${feed.blocks[0].videoCount} videos)`);

    setCustomFeedPlayback(initialState);

    // Clear existing queues and start fresh
    setBlockQueue(new Map());
    setVideoQueue({ videos: [], currentIndex: 0, isLoading: false, lastBlockIndex: -1, blockPositions: [] });
    
    // Clear seen videos for fresh randomization
    videoTracker.clear();
    console.log('🧹 Cleared seen videos cache and queue for fresh start');
    
    // Initialize queue with first few blocks
    console.log('🚀 Initializing video queue with first blocks');
    const blocksToLoadAtStart = Math.min(3, feed.blocks.length);
    
    // Load blocks sequentially and collect all videos with deduplication
    const allInitialVideos: SoraFeedItem[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < blocksToLoadAtStart; i++) {
      const block = feed.blocks[i];
      const videosNeeded = getVideosForBlock(block.videoCount);
      console.log(`📦 Loading block ${i} for initial queue: "${block.searchQuery}" (${block.videoCount} videos needed)`);
      const blockVideos = await prefetchBlockVideos(i, block.searchQuery, videosNeeded);
      
      // Deduplicate videos across blocks
      const uniqueBlockVideos = blockVideos.filter(video => {
        if (seenIds.has(video.post.id)) {
          return false;
        }
        seenIds.add(video.post.id);
        return true;
      });
      
      console.log(`📦 Block ${i}: ${uniqueBlockVideos.length}/${blockVideos.length} unique videos (${blockVideos.length - uniqueBlockVideos.length} duplicates filtered)`);
      allInitialVideos.push(...uniqueBlockVideos);
      
      // Update the queue state and track block positions
      setVideoQueue(prev => {
        const newBlockPositions = [...prev.blockPositions];
        newBlockPositions[i] = prev.videos.length; // Record where this block starts
        
        return {
          ...prev,
          videos: [...prev.videos, ...uniqueBlockVideos],
          lastBlockIndex: i,
          blockPositions: newBlockPositions
        };
      });
    }
    
    // Set initial videos from collected videos
    if (allInitialVideos.length > 0) {
      const initialDisplayVideos = allInitialVideos.slice(0, 20);
      setItems(initialDisplayVideos); // Show first 20 videos
      console.log(`🎬 Custom feed ready with ${allInitialVideos.length} total videos (showing first 20)`);
      
      // Debug: Log what videos are actually being displayed
      console.log(`🎭 Videos being displayed in custom feed:`);
      initialDisplayVideos.slice(0, 5).forEach((video, i) => {
        console.log(`   ${i + 1}. "${video.post.text}" (ID: ${video.post.id})`);
      });
      
      // Initialize timeline state
      const totalVideos = calculateTotalVideos(feed);
      setTimelineState({
        totalVideos,
        currentVideoIndex: 0,
        currentBlockIndex: 0,
        videoProgress: 0
      });
      
      // Initialize block tracking
      initializeBlockTracking(feed, 0);
    } else {
      console.error('❌ No videos loaded for custom feed');
      setError('Failed to load videos for custom feed');
    }
  }, [initializeBlockTracking, prefetchBlockVideos, getVideosForBlock]);

  // Track if we're waiting for a video to finish before transitioning
  const waitingForVideoEndRef = useRef(false);
  const pendingBlockTransitionRef = useRef<(() => void) | null>(null);
  const lastProgressUpdateRef = useRef(0);

  // Handle video events for custom feed timing and timeline updates
  const handleCustomFeedVideoEvent = useCallback((eventType: 'loadedmetadata' | 'ended' | 'timeupdate', videoDuration?: number, currentTime?: number, videoIndex?: number) => {
    if (feedType !== 'custom' || !selectedCustomFeed) return;

    if (eventType === 'loadedmetadata' && videoIndex !== undefined) {
      console.log(`📹 Video ${videoIndex} loaded`);
      
      // Update timeline state with current video
      setTimelineState(prev => ({
        ...prev,
        currentVideoIndex: videoIndex
      }));
      
      // Update video queue current index
      setVideoQueue(prev => ({
        ...prev,
        currentIndex: videoIndex
      }));
      
      // Check block progress when video loads
      checkBlockProgress(selectedCustomFeed);
      
    } else if (eventType === 'timeupdate' && currentTime !== undefined && videoDuration !== undefined && videoIndex !== undefined) {
      // Throttle timeupdate events to avoid excessive state updates (max once per 500ms)
      const now = Date.now();
      if (now - lastProgressUpdateRef.current < 500) return;
      lastProgressUpdateRef.current = now;
      
      // Update video progress within current video (0-1)
      const videoProgress = videoDuration > 0 ? Math.min(currentTime / videoDuration, 1) : 0;
      
      setTimelineState(prev => ({
        ...prev,
        currentVideoIndex: videoIndex,
        videoProgress: videoProgress
      }));
      
    } else if (eventType === 'ended' && videoIndex !== undefined) {
      console.log(`🎬 Video ${videoIndex} ended`);
      
      // Update to next video index
      const nextVideoIndex = videoIndex + 1;
      setVideoQueue(prev => ({
        ...prev,
        currentIndex: nextVideoIndex
      }));
      
      setTimelineState(prev => ({
        ...prev,
        currentVideoIndex: nextVideoIndex,
        videoProgress: 0
      }));
      
      // Check if we need to transition to next block
      checkBlockProgress(selectedCustomFeed);
    }
  }, [feedType, selectedCustomFeed, checkBlockProgress]);

  const loadFeed = useCallback(async (type: FeedType = feedType, reset: boolean = true) => {
    try {
      if (reset) {
        setLoading(true);
        setError(null);
        setCursor(null);
        setHasMore(true);
      }
      console.log(`🔄 Loading ${type} feed data...`);
      
      // Handle favorites feed
      if (type === 'favorites') {
        const favorites = getFavorites();
        console.log('✅ Loaded', favorites.length, 'favorite items');
        if (reset) {
          setItems(favorites);
        } else {
          setItems(prev => [...prev, ...favorites]);
        }
        setCursor(null);
        setHasMore(false); // No pagination for favorites
        setLoading(false);
        return;
      }
      
      // Handle search feed
      if (type === 'search') {
        if (!searchQuery || searchQuery.trim().length === 0) {
          setItems([]);
          setLoading(false);
          setHasMore(false);
          return;
        }
        
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20&format=${formatFilter}`);
        if (!response.ok) {
          throw new Error('Failed to search database');
        }
        const data = await response.json();
        console.log('✅ Loaded', data.items?.length || 0, 'search results');
        
        if (reset) {
          setItems(data.items || []);
        } else {
          // Deduplicate items to prevent duplicate keys
          setItems(prev => {
            const existingIds = new Set(prev.map((item: SoraFeedItem) => item.post.id));
            const newItems = (data.items || []).filter((item: SoraFeedItem) => !existingIds.has(item.post.id));
            return [...prev, ...newItems];
          });
        }
        setCursor(null);
        setHasMore(false); // No pagination for search yet
        setLoading(false);
        return;
      }
      
      // Map feed type to API cut parameter
      const cut = type === 'top' ? 'nf2_top' : 'nf2_latest';
      // For top feed, request more items since we need to filter client-side
      const requestLimit = type === 'top' ? 30 : 20; // Reduced from 100 to prevent overloading
      const data = await fetchFeed(requestLimit, cut, undefined, formatFilter);
      console.log('✅ Loaded', data.items?.length || 0, 'feed items');
      
      if (data.items && data.items.length > 0) {
        // 🔍 USERNAME LOGGING: Log items being set in FeedLoader
        console.log('📋 FeedLoader setting items:', {
          itemCount: data.items.length,
          reset,
          sampleItems: data.items.slice(0, 3).map(item => ({
            postId: item.post.id,
            username: item.profile.username,
            displayName: item.profile.display_name,
            userId: item.profile.user_id
          }))
        });
        
        if (reset) {
          setItems(data.items);
        } else {
          // Deduplicate items to prevent duplicate keys
          setItems(prev => {
            const existingIds = new Set(prev.map((item: SoraFeedItem) => item.post.id));
            const newItems = data.items.filter((item: SoraFeedItem) => !existingIds.has(item.post.id));
            return [...prev, ...newItems];
          });
        }
        setCursor(data.cursor || null);
        setHasMore(!!data.cursor);
        
        // Preload remix feeds for all items
        console.log('📦 Starting remix preload for', data.items.length, 'items');
        remixCache.preloadRemixFeeds(data.items);
      } else {
        if (reset) {
          console.warn('⚠️ No items in feed response, using mock data');
          setItems(mockFeedData.items);
          setCursor(null);
          setHasMore(false);
          
          // Preload remix feeds for mock data
          remixCache.preloadRemixFeeds(mockFeedData.items);
        }
      }
    } catch (err) {
      console.error('❌ Failed to load feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load feed');
      
      if (reset) {
        // Fallback to mock data on error
        console.log('🔄 Falling back to mock data');
        setItems(mockFeedData.items);
        setCursor(null);
        setHasMore(false);
        
        // Preload remix feeds for mock data
        remixCache.preloadRemixFeeds(mockFeedData.items);
      }
    } finally {
      if (reset) {
        setLoading(false);
      }
    }
  }, [feedType, formatFilter, searchQuery]);

  const loadMoreFeed = async () => {
    // Handle custom feeds differently - load more from queue
    if (feedType === 'custom' && selectedCustomFeed) {
      if (!hasMore || loadingMore) return;
      
      try {
        setLoadingMore(true);
        console.log('🔄 Loading more videos from custom feed queue...');
        
        // Check if we have more videos in the queue
        const remainingInQueue = videoQueue.videos.length - videoQueue.currentIndex - items.length;
        
        if (remainingInQueue > 0) {
          // Load more videos from the current queue position
          const currentEndIndex = videoQueue.currentIndex + items.length;
          const moreVideos = videoQueue.videos.slice(currentEndIndex, currentEndIndex + 10) as SoraFeedItem[];
          
          if (moreVideos.length > 0) {
            // Deduplicate videos to prevent duplicate keys
            setItems(prev => {
              const existingIds = new Set(prev.map((item: SoraFeedItem) => item.post.id));
              const newItems = moreVideos.filter((item: SoraFeedItem) => !existingIds.has(item.post.id));
              console.log(`✅ Loaded ${newItems.length}/${moreVideos.length} new videos from queue (${moreVideos.length - newItems.length} duplicates filtered)`);
              return [...prev, ...newItems];
            });
          }
        } else {
          // Queue is running low, try to load more blocks
          if (selectedCustomFeed) {
            await ensureQueueSize(selectedCustomFeed);
            // Try again after ensuring queue size
            const newRemainingInQueue = videoQueue.videos.length - videoQueue.currentIndex - items.length;
            if (newRemainingInQueue > 0) {
              const currentEndIndex = videoQueue.currentIndex + items.length;
              const moreVideos = videoQueue.videos.slice(currentEndIndex, currentEndIndex + 10) as SoraFeedItem[];
              if (moreVideos.length > 0) {
                // Deduplicate videos to prevent duplicate keys
                setItems(prev => {
                  const existingIds = new Set(prev.map((item: SoraFeedItem) => item.post.id));
                  const newItems = moreVideos.filter((item: SoraFeedItem) => !existingIds.has(item.post.id));
                  console.log(`✅ Loaded ${newItems.length}/${moreVideos.length} new videos after queue refill (${moreVideos.length - newItems.length} duplicates filtered)`);
                  return [...prev, ...newItems];
                });
              }
            } else {
              setHasMore(false);
              console.log('🏁 No more videos available in custom feed');
            }
          }
        }
      } catch (err) {
        console.error('❌ Failed to load more custom feed videos:', err);
        setHasMore(false);
      } finally {
        setLoadingMore(false);
      }
      return;
    }
    
    // Handle regular feeds (non-custom)
    if (!hasMore || loadingMore || !cursor) return;
    
    try {
      setLoadingMore(true);
      console.log('🔄 Loading more feed data with cursor...');
      
      const cut = feedType === 'top' ? 'nf2_top' : 'nf2_latest';
      const data = await fetchFeed(20, cut, cursor, formatFilter);
      console.log('✅ Loaded', data.items?.length || 0, 'more feed items');
      
      if (data.items && data.items.length > 0) {
        // Deduplicate items to prevent duplicate keys
        setItems(prev => {
          const existingIds = new Set(prev.map((item: SoraFeedItem) => item.post.id));
          const newItems = data.items.filter((item: SoraFeedItem) => !existingIds.has(item.post.id));
          return [...prev, ...newItems];
        });
        setCursor(data.cursor || null);
        setHasMore(!!data.cursor);
        
        // Preload remix feeds for newly loaded items
        console.log('📦 Starting remix preload for', data.items.length, 'more items');
        remixCache.preloadRemixFeeds(data.items);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('❌ Failed to load more feed:', err);
      // Don't show error for pagination failures, just stop loading more
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleFeedTypeChange = async (type: FeedType, customFeed?: CustomFeed) => {
    console.log('🔄 handleFeedTypeChange called:', { type, customFeed: customFeed?.name || 'none' });
    
    // Clear any existing custom feed timers
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }

    updateFeedType(type);
    setIsDropdownOpen(false);
    
    if (type === 'search') {
      console.log('🔍 Switching to search mode');
      setSearchExpanded(true);
      setCustomFeedPlayback(null);
      updateSelectedCustomFeed(null);
      setBlockQueue(new Map());
      setVideoQueue({ videos: [], currentIndex: 0, isLoading: false, lastBlockIndex: -1, blockPositions: [] });
    } else if (type === 'custom' && customFeed) {
      console.log('🎵 Switching to custom feed:', customFeed.name);
      setSearchExpanded(false);
      updateSelectedCustomFeed(customFeed);
      await startCustomFeedPlayback(customFeed);
    } else if (type === 'custom' && !customFeed) {
      console.log('⚠️ Custom feed type selected but no feed provided');
      setSearchExpanded(false);
      setCustomFeedPlayback(null);
      updateSelectedCustomFeed(null);
      setBlockQueue(new Map());
      setVideoQueue({ videos: [], currentIndex: 0, isLoading: false, lastBlockIndex: -1, blockPositions: [] });
    } else {
      console.log('📺 Switching to standard feed:', type);
      setSearchExpanded(false);
      setCustomFeedPlayback(null);
      updateSelectedCustomFeed(null);
      setBlockQueue(new Map());
      setVideoQueue({ videos: [], currentIndex: 0, isLoading: false, lastBlockIndex: -1, blockPositions: [] });
      await loadFeed(type);
    }
  };

  const handleSearch = async () => {
    if (searchInput.trim().length === 0) return;
    setSearchQuery(searchInput.trim());
    updateFeedType('search');
    setLoading(true);
    setError(null);
    setCursor(null);
    setHasMore(false);
    
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchInput.trim())}&limit=20&format=${formatFilter}`);
      if (!response.ok) {
        throw new Error('Failed to search database');
      }
      const data = await response.json();
      console.log('✅ Loaded', data.items?.length || 0, 'search results');
      setItems(data.items || []);
    } catch (err) {
      console.error('❌ Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load custom feeds on mount
  useEffect(() => {
    loadCustomFeeds();
  }, [loadCustomFeeds]);

  // Restore selected custom feed from localStorage
  useEffect(() => {
    const storedFeedId = getStoredSelectedCustomFeedId();
    const storedFeedType = getStoredFeedType();
    
    console.log('🔄 Restoration check:', { 
      storedFeedId, 
      storedFeedType, 
      currentFeedType: feedType,
      customFeedsCount: customFeeds.length,
      selectedCustomFeed: selectedCustomFeed?.name || 'none'
    });
    
    if (customFeeds.length > 0) {
      if (storedFeedId) {
        const storedFeed = customFeeds.find(feed => feed.id === storedFeedId);
        if (storedFeed) {
          console.log('🔄 Restoring selected custom feed from localStorage:', storedFeed.name);
          updateSelectedCustomFeed(storedFeed);
          // If the stored feed type is custom, start playback
          if (feedType === 'custom') {
            startCustomFeedPlayback(storedFeed).catch(console.error);
          }
        } else {
          // Feed no longer exists, clear stored ID and fallback
          console.log('⚠️ Stored custom feed no longer exists, clearing stored ID');
          saveSelectedCustomFeedId(null);
          updateSelectedCustomFeed(null);
          // Only fallback to latest if we're on page load (not manual selection)
          if (feedType === 'custom' && !selectedCustomFeed) {
            console.log('⚠️ Falling back to latest since stored feed is gone');
            updateFeedType('latest');
            loadFeed('latest');
          }
        }
      } else if (feedType === 'custom' && !selectedCustomFeed) {
        // Only fallback if there's no selected feed and we're likely on page load
        // This prevents interfering with manual feed selection
        console.log('⚠️ No stored custom feed found on page load, falling back to latest');
        updateFeedType('latest');
        loadFeed('latest');
      }
    } else if (feedType === 'custom' && customFeeds.length === 0) {
      // No custom feeds available at all - fallback to latest
      console.log('⚠️ No custom feeds available, falling back to latest');
      updateFeedType('latest');
      loadFeed('latest');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFeeds]);

  // Restart playback when selected feed is updated while playing
  useEffect(() => {
    if (feedType === 'custom' && selectedCustomFeed && customFeedPlayback && selectedCustomFeed.updatedAt) {
      // Only restart if the feed was actually updated (has updatedAt timestamp)
      // and it's different from when playback started
      const playbackStartVideoIndex = customFeedPlayback.blockStartVideoIndex;
      if (selectedCustomFeed.updatedAt > Date.now() - 60000) { // Updated within last minute
        console.log('🔄 Feed was updated, restarting playback');
        startCustomFeedPlayback(selectedCustomFeed).catch(console.error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomFeed?.updatedAt]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
      }
    };
  }, []);

  // Initial load - only run once on mount, but wait for custom feeds to be loaded
  useEffect(() => {
    // Wait a bit for custom feeds to be loaded if feedType is custom
    if (feedType === 'custom') {
      console.log('🔄 Waiting for custom feed restoration before loading');
      // Don't load anything yet, let the restoration logic handle it
      return;
    }
    
    // For non-custom feeds, load immediately
    loadFeed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  if (loading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading Sora Feed...</p>
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-semibold mb-2">Failed to Load Feed</h2>
          <p className="text-white/70 text-sm mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-white text-black rounded-full hover:bg-gray-200 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="fixed top-4 left-4 right-20 bg-yellow-500/90 text-black px-4 py-2 rounded-lg z-50 text-sm">
          ⚠️ Using fallback data: {error}
        </div>
      )}
      
      {/* Remix Cache Debug Panel */}
      <RemixCacheDebug />
      
      {/* Custom Feed Builder Modal */}
      <CustomFeedBuilder
        isOpen={isBuilderOpen}
        onClose={() => {
          setIsBuilderOpen(false);
          setEditingFeed(null);
        }}
        onSave={handleSaveCustomFeed}
        editingFeed={editingFeed}
      />
      
      {/* Custom Feed Timeline */}
      <CustomFeedTimeline
        feed={selectedCustomFeed}
        currentVideoIndex={timelineState.currentVideoIndex}
        totalVideos={timelineState.totalVideos}
        videoProgress={timelineState.videoProgress}
        blockPositions={videoQueue.blockPositions}
        isVisible={feedType === 'custom' && selectedCustomFeed !== null && (blockIndicatorPinned || showControls)}
      />
      
      {/* Feed Type Selector */}
      <div 
        className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ 
          maxWidth: searchExpanded ? 'min(600px, calc(100vw - 3rem))' : 'fit-content',
          width: searchExpanded ? 'min(600px, calc(100vw - 3rem))' : 'fit-content'
        }}
      >
        <div className="flex flex-col gap-3 items-center px-2">
          {/* Dropdown Container */}
          <div ref={dropdownRef} className="relative w-full">
            <div className={`flex items-center bg-black/50 rounded-full p-1 backdrop-blur-sm transition-all ${
              searchExpanded ? 'flex-nowrap' : 'flex-nowrap'
            }`}>
              {/* Selected Button */}
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 flex-shrink-0 cursor-pointer ${
                  feedType === 'latest'
                    ? 'bg-white text-black'
                    : feedType === 'top'
                    ? 'bg-white text-black'
                    : feedType === 'favorites'
                    ? 'bg-white text-black'
                    : feedType === 'search'
                    ? 'bg-white text-black'
                    : feedType === 'custom'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                    : 'text-white hover:bg-white/20'
                }`}
              >
                <span>
                  {feedType === 'latest' ? 'Latest' : 
                   feedType === 'top' ? 'Top' : 
                   feedType === 'favorites' ? 'Favorites' : 
                   feedType === 'search' ? 'Search' : 
                   feedType === 'custom' && selectedCustomFeed ? selectedCustomFeed.name : 'Latest'}
                </span>
                <ChevronDown size={16} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Search Input - Expands to the right when search is selected */}
              {searchExpanded && (
                <div className="flex items-center gap-2 ml-2 flex-1 min-w-0">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyPress={handleSearchKeyPress}
                    placeholder="Search..."
                    className="px-4 py-2 bg-white/10 text-white placeholder-white/50 rounded-full text-sm focus:outline-none focus:bg-white/20 flex-1 min-w-0 w-0"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-3 py-2 bg-white text-black rounded-full text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              )}
            </div>

            {/* Dropdown Menu */}
            {isDropdownOpen && showControls && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-black/50 backdrop-blur-sm rounded-2xl p-2 min-w-full shadow-lg max-h-[70vh] overflow-y-auto">
                {feedType !== 'latest' && (
                  <button
                    onClick={() => handleFeedTypeChange('latest')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap cursor-pointer"
                  >
                    Latest
                  </button>
                )}
                {feedType !== 'top' && (
                  <button
                    onClick={() => handleFeedTypeChange('top')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap cursor-pointer"
                  >
                    Top
                  </button>
                )}
                {feedType !== 'favorites' && (
                  <button
                    onClick={() => handleFeedTypeChange('favorites')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap cursor-pointer"
                  >
                    Favorites
                  </button>
                )}
                {feedType !== 'search' && (
                  <button
                    onClick={() => handleFeedTypeChange('search')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap cursor-pointer"
                  >
                    Search
                  </button>
                )}
                
                {/* Custom Feeds Section */}
                {customFeeds.length > 0 && (
                  <div className="border-t border-white/10 mt-2 pt-2">
                    <div className="px-4 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider">
                      Custom Feeds
                    </div>
                    {customFeeds.map((feed) => (
                      <div
                        key={feed.id}
                        className="group flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/20 transition-all"
                      >
                        <button
                          onClick={() => handleFeedTypeChange('custom', feed)}
                          className="flex-1 text-left text-sm font-medium text-white cursor-pointer"
                        >
                          {feed.name}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditCustomFeed(feed);
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all"
                          title="Edit"
                        >
                          <Edit2 size={14} className="text-white/60" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomFeed(feed.id);
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded transition-all"
                          title="Delete"
                        >
                          <XIcon size={14} className="text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Create New Custom Feed Button */}
                <div className="border-t border-white/10 mt-2 pt-2">
                  <button
                    onClick={handleCreateNewFeed}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-blue-400 hover:bg-blue-500/20 transition-all whitespace-nowrap cursor-pointer flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Create Custom Feed
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <VerticalCarousel 
        key={`${feedType}-${searchQuery}-${selectedCustomFeed?.id || ''}-${formatFilter}`} // Force remount when feed type, search, or format filter changes
        items={filterItemsByFormat(items)} 
        onLoadMore={loadMoreFeed}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onAddToFavorites={addToFavorites}
        onRemoveFromFavorites={removeFromFavorites}
        isInFavorites={isInFavorites}
        onControlsChange={setShowControls}
        onCustomFeedVideoEvent={feedType === 'custom' ? handleCustomFeedVideoEvent : undefined}
        formatFilter={formatFilter}
        onFormatFilterChange={updateFormatFilter}
      />
    </>
  );
}
