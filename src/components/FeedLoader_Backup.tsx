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
import { CustomFeed, CustomFeedPlaybackState, BlockQueue } from '@/types/customFeed';
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
  
  // Block queue for prefetching
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

  // Simple video fetching for pre-compilation
  const fetchVideosForBlock = useCallback(async (searchQuery: string): Promise<SoraFeedItem[]> => {
    try {
      console.log(`📦 Fetching videos for: "${searchQuery}" with TRUE RANDOMIZATION`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased timeout for larger requests
      
      // Add timestamp to ensure different results each time
      const timestamp = Date.now();
      
      // FETCH MORE RESULTS FOR TRUE RANDOMIZATION: Get 100 results and pick 3 randomly
      const fetchLimit = 100;
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=${fetchLimit}&fast=true&t=${timestamp}&format=${formatFilter}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Prefetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      const allVideos = data.items || [];
      
      // TRULY RANDOM SELECTION: Pick 3 random videos from the larger set
      let videos: SoraFeedItem[] = [];
      if (allVideos.length > 0) {
        const targetCount = Math.min(3, allVideos.length);
        const selectedIndices = new Set<number>();
        const selectedVideoIds = new Set<string>();
        
        // Generate random indices without replacement, also ensuring no duplicate video IDs
        let attempts = 0;
        const maxAttempts = Math.min(100, allVideos.length * 2); // Prevent infinite loops
        
        while (selectedIndices.size < targetCount && attempts < maxAttempts) {
          const randomIndex = Math.floor(Math.random() * allVideos.length);
          const video = allVideos[randomIndex];
          
          // Only add if we haven't selected this index or video ID before
          if (!selectedIndices.has(randomIndex) && !selectedVideoIds.has(video.post.id)) {
            selectedIndices.add(randomIndex);
            selectedVideoIds.add(video.post.id);
          }
          attempts++;
        }
        
        videos = Array.from(selectedIndices).map(index => allVideos[index]);
        console.log(`🎲 Randomly selected ${videos.length} unique videos from ${allVideos.length} results for "${searchQuery}" (${attempts} attempts)`);
      }
      
      // If no results, try a broader search
      if (videos.length === 0) {
        console.log(`🔄 Still no results for "${searchQuery}", trying broader search with randomization...`);
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
              
              // Randomly select from broader results too
              const targetCount = Math.min(3, broaderVideos.length);
              const selectedIndices = new Set<number>();
              const selectedVideoIds = new Set<string>();
              
              let attempts = 0;
              const maxAttempts = Math.min(100, broaderVideos.length * 2);
              
              while (selectedIndices.size < targetCount && attempts < maxAttempts) {
                const randomIndex = Math.floor(Math.random() * broaderVideos.length);
                const video = broaderVideos[randomIndex];
                
                if (!selectedIndices.has(randomIndex) && !selectedVideoIds.has(video.post.id)) {
                  selectedIndices.add(randomIndex);
                  selectedVideoIds.add(video.post.id);
                }
                attempts++;
              }
              
              videos = Array.from(selectedIndices).map(index => broaderVideos[index]);
              console.log(`🎲 Randomly selected ${videos.length} unique videos from ${broaderVideos.length} broader results (${attempts} attempts)`);
            }
          }
        }
      }
      
      // Filter out videos we've already seen to maintain variety
      const unseenVideos = videos.filter((video: SoraFeedItem) => !videoTracker.hasSeen(video.post.id));
      const unseenCount = unseenVideos.length;
      const totalCount = videos.length;
      
      console.log(`📊 Video breakdown: ${unseenCount} unseen, ${totalCount - unseenCount} already seen`);
      
      // Use unseen videos first, fallback to first 3 if all seen
      let videosToUse: SoraFeedItem[] = unseenVideos.length > 0 ? unseenVideos : videos.slice(0, 3);
      
      console.log(`📊 Video analysis for "${searchQuery}": ${totalCount} total, ${unseenCount} unseen, ${totalCount - unseenCount} already seen`);
      
      // If we have less than 3 videos to use, we need to fetch more
      if (videosToUse.length < 3 && videos.length > 0) {
        console.log(`⚠️ Low unseen video count (${unseenCount}), fetching more with randomization...`);
        try {
          // Try to get more videos with randomization
          const moreResponse = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=${fetchLimit}&fast=true&t=${timestamp + 2}&format=${formatFilter}`, {
            signal: controller.signal
          });
          if (moreResponse.ok) {
            const moreData = await moreResponse.json();
            const allMoreVideos: SoraFeedItem[] = moreData.items || [];
            
            if (allMoreVideos.length > 0) {
              // Randomly select from the additional results
              const targetCount = Math.min(10, allMoreVideos.length); // Get up to 10 more
              const selectedIndices = new Set<number>();
              const selectedVideoIds = new Set<string>();
              
              let attempts = 0;
              const maxAttempts = Math.min(100, allMoreVideos.length * 2);
              
              while (selectedIndices.size < targetCount && attempts < maxAttempts) {
                const randomIndex = Math.floor(Math.random() * allMoreVideos.length);
                const video = allMoreVideos[randomIndex];
                
                if (!selectedIndices.has(randomIndex) && !selectedVideoIds.has(video.post.id)) {
                  selectedIndices.add(randomIndex);
                  selectedVideoIds.add(video.post.id);
                }
                attempts++;
              }
              
              const moreVideos = Array.from(selectedIndices).map(index => allMoreVideos[index]);
              const moreUnseen = moreVideos.filter((video: SoraFeedItem) => !videoTracker.hasSeen(video.post.id));
              
              // Add the new unseen videos to our collection
              videosToUse.push(...moreUnseen);
              console.log(`📈 Randomly selected ${moreVideos.length} from ${allMoreVideos.length} additional results, ${moreUnseen.length} were unseen`);
            }
          }
        } catch (moreErr) {
          console.warn('Failed to fetch additional videos:', moreErr);
        }
      }
      
      // Final check: if we still don't have enough videos, use all available
      if (videosToUse.length === 0) {
        // All videos are seen, use them anyway but shuffle well
        videosToUse = videos;
        console.log(`🔄 All videos seen for "${searchQuery}", using anyway with good shuffle`);
      }
      
      // Triple shuffle for maximum randomness in custom channels
      const shuffled = [...videosToUse]
        .sort(() => Math.random() - 0.5)  // First shuffle
        .sort(() => Math.random() - 0.5)  // Second shuffle
        .sort(() => Math.random() - 0.5); // Third shuffle for even better distribution
      
      // Mark the videos we're returning as seen
      const videoIds = shuffled.map(video => video.post.id).filter(Boolean);
      videoTracker.markMultipleAsSeen(videoIds);
      
      console.log(`✅ Fetched ${shuffled.length} videos for "${searchQuery}" (${unseenCount} were unseen)`);
      
      // Log video tracker stats periodically
      const stats = videoTracker.getStats();
      if (stats.total % 50 === 0 && stats.total > 0) {
        console.log(`📊 Video tracker stats: ${stats.total} videos tracked`);
      }
      
      return shuffled;
    } catch (err) {
      // Handle AbortError more gracefully
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`⏰ Request timeout for "${searchQuery}"`);
        
        // Retry with a smaller limit
        console.log(`🔄 Retrying with smaller limit...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const timestamp = Date.now();
          const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=100&fast=true&t=${timestamp}&format=${formatFilter}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          const videos = data.items || [];
          console.log(`✅ Retry successful: ${videos.length} videos for "${searchQuery}"`);
          return videos;
        } catch (retryErr) {
          console.warn(`⚠️ Retry also failed for "${searchQuery}":`, retryErr instanceof Error ? retryErr.message : retryErr);
          return [];
        }
      } else {
        console.error(`❌ Failed to fetch videos for "${searchQuery}":`, err);
        console.error(`❌ Error details:`, err instanceof Error ? err.message : err);
      }
      return [];
    }
  }, [formatFilter]);

  // Add block to queue with prefetched videos - function removed

  // Get videos from queue or load immediately - function removed

  // Removed loadCustomFeedBlock - now using simple pre-compiled queue


  // Start prefetching next blocks during current block playback - function removed

  // Execute the actual block transition logic - function removed

  // Handle video end event for custom feed progression (no more timers!)
  // Removed complex block transition logic - now using simple pre-compiled queue

  const startCustomFeedPlayback = useCallback(async (feed: CustomFeed) => {
    console.log(`🎵 Starting custom feed: "${feed.name}" (${feed.blocks.length} blocks)`);
    
    if (!feed.blocks || feed.blocks.length === 0) {
      setError('Custom feed has no blocks');
      return;
    }

    // Clear timers and reset state
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }

    // Pre-compile ALL blocks into a single video queue
    console.log('🧠 Pre-compiling all blocks...');
    const allVideos: SoraFeedItem[] = [];
    
    for (const block of feed.blocks) {
      console.log(`📦 Compiling block: "${block.searchQuery}"`);
      const blockVideos = await fetchVideosForBlock(block.searchQuery);
      allVideos.push(...blockVideos);
    }

    console.log(`✅ Pre-compiled ${allVideos.length} videos from ${feed.blocks.length} blocks`);

    // Set up simple playback state
    setCustomFeedPlayback({
      currentBlockIndex: 0,
      blockStartTime: Date.now(),
      currentSearchQuery: 'compiled',
      blockElapsedTime: 0,
      currentVideoStartTime: Date.now(),
      currentVideoDuration: 0,
    });

    // Set all videos at once - no more block transitions!
    setItems(allVideos);
    setCursor(null);
    setHasMore(feed.loop); // Enable looping if feed loops
    setError(null);
    
    console.log(`🎬 Custom feed ready with ${allVideos.length} videos`);
  }, [fetchVideosForBlock]);

  // Removed complex transition tracking - using simple pre-compiled queue

  // Handle video events for custom feed timing
  const handleCustomFeedVideoEvent = useCallback((eventType: 'loadedmetadata' | 'ended', videoDuration?: number) => {
    if (feedType !== 'custom' || !customFeedPlayback) return;

    if (eventType === 'loadedmetadata' && videoDuration) {
      // Update playback state with video duration
      setCustomFeedPlayback(prev => prev ? {
        ...prev,
        currentVideoDuration: videoDuration,
        currentVideoStartTime: Date.now(),
      } : null);
    }
    // No need to handle 'ended' - videos will naturally progress in the carousel
  }, [feedType, customFeedPlayback]);

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
        
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=3&format=${formatFilter}`);
        if (!response.ok) {
          throw new Error('Failed to search database');
        }
        const data = await response.json();
        console.log('✅ Loaded', data.items?.length || 0, 'search results');
        
        if (reset) {
          setItems(data.items || []);
        } else {
          setItems(prev => [...prev, ...(data.items || [])]);
        }
        setCursor(null);
        setHasMore(false); // No pagination for search yet
        setLoading(false);
        return;
      }
      
      // Map feed type to API cut parameter
      const cut = type === 'top' ? 'nf2_top' : 'nf2_latest';
      // For top feed, request more items since we need to filter client-side
      const requestLimit = type === 'top' ? 100 : 100; // Both use 100, but top will fetch 200 internally
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
          setItems(prev => [...prev, ...data.items]);
        }
        setCursor(data.cursor || null);
        setHasMore(!!data.cursor);
        
        // Preload remix feeds for all items
        console.log('📦 Starting remix preload for', data.items.length, 'items');
        remixCache.preloadRemixFeeds(data.items);
      } else {
        if (reset) {
          console.warn('⚠️ No items in feed response');
          // Only use mock data in development mode
          if (process.env.NODE_ENV === 'development') {
            console.log('🔧 Development mode: using mock data');
            setItems(mockFeedData.items);
            setCursor(null);
            setHasMore(false);
            
            // Preload remix feeds for mock data
            remixCache.preloadRemixFeeds(mockFeedData.items);
          } else {
            setError('No videos available');
            setItems([]);
            setCursor(null);
            setHasMore(false);
          }
        }
      }
    } catch (err) {
      console.error('❌ Failed to load feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load feed');
      
      if (reset) {
        // Only fallback to mock data in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Development mode: falling back to mock data');
          setItems(mockFeedData.items);
          setCursor(null);
          setHasMore(false);
          
          // Preload remix feeds for mock data
          remixCache.preloadRemixFeeds(mockFeedData.items);
        } else {
          setItems([]);
          setCursor(null);
          setHasMore(false);
        }
      }
    } finally {
      if (reset) {
        setLoading(false);
      }
    }
  }, [feedType, formatFilter, searchQuery]);

  const loadMoreFeed = async () => {
    if (!hasMore || loadingMore || !cursor) return;
    
    try {
      setLoadingMore(true);
      console.log('🔄 Loading more feed data with cursor...');
      
      const cut = feedType === 'top' ? 'nf2_top' : 'nf2_latest';
      const data = await fetchFeed(100, cut, cursor, formatFilter);
      console.log('✅ Loaded', data.items?.length || 0, 'more feed items');
      
      if (data.items && data.items.length > 0) {
        setItems(prev => [...prev, ...data.items]);
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
    } else if (type === 'custom' && customFeed) {
      console.log('🎵 Switching to custom feed:', customFeed.name);
      setSearchExpanded(false);
      updateSelectedCustomFeed(customFeed);
      startCustomFeedPlayback(customFeed);
    } else if (type === 'custom' && !customFeed) {
      console.log('⚠️ Custom feed type selected but no feed provided');
      setSearchExpanded(false);
      setCustomFeedPlayback(null);
      updateSelectedCustomFeed(null);
      setBlockQueue(new Map());
    } else {
      console.log('📺 Switching to standard feed:', type);
      setSearchExpanded(false);
      setCustomFeedPlayback(null);
      updateSelectedCustomFeed(null);
      setBlockQueue(new Map());
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
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchInput.trim())}&limit=3&format=${formatFilter}`);
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
            startCustomFeedPlayback(storedFeed);
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
      const playbackStartTime = customFeedPlayback.blockStartTime;
      if (selectedCustomFeed.updatedAt > playbackStartTime) {
        console.log('🔄 Feed was updated, restarting playback');
        startCustomFeedPlayback(selectedCustomFeed);
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
      
      {/* Custom Feed Playback Indicator */}
      {customFeedPlayback && selectedCustomFeed && (blockIndicatorPinned || showControls) && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-blue-500/90 to-purple-500/90 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg">
          <div className="flex items-center gap-3 text-white">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-sm font-medium">
                Block {customFeedPlayback.currentBlockIndex + 1}/{selectedCustomFeed.blocks.length}
              </span>
            </div>
            <div className="w-px h-4 bg-white/30" />
            <span className="text-sm font-medium">
              {customFeedPlayback.currentSearchQuery}
            </span>
            {blockQueue.size > 0 && (
              <>
                <div className="w-px h-4 bg-white/30" />
                <span className="text-xs opacity-75">
                  📦 {Array.from(blockQueue.values()).filter(b => !b.isLoading && b.videos.length > 0).length} ready
                  {selectedCustomFeed?.loop && blockQueue.has(0) && customFeedPlayback && customFeedPlayback.currentBlockIndex > 0 && (
                    <span className="text-green-400"> • Loop ready</span>
                  )}
                </span>
              </>
            )}
            {selectedCustomFeed.loop && (
              <>
                <div className="w-px h-4 bg-white/30" />
                <span className="text-xs opacity-75">Looping</span>
              </>
            )}
            <div className="w-px h-4 bg-white/30" />
            <button
              onClick={toggleBlockIndicatorPin}
              className={`p-1 rounded-full transition-all hover:bg-white/20 ${
                blockIndicatorPinned ? 'text-yellow-300' : 'text-white/70'
              }`}
              title={blockIndicatorPinned ? 'Unpin indicator' : 'Pin indicator'}
            >
              <Pin size={14} className={blockIndicatorPinned ? 'fill-current' : ''} />
            </button>
          </div>
        </div>
      )}
      
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
