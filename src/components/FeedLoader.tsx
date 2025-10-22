'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SoraFeedItem } from '@/types/sora';
import { fetchFeed } from '@/lib/api';
import { remixCache } from '@/lib/remixCache';
import VerticalCarousel from './VerticalCarousel';
import RemixCacheDebug from './RemixCacheDebug';
import { mockFeedData } from '@/lib/mockData';
import { ChevronDown, Plus, Edit2, X as XIcon } from 'lucide-react';
import CustomFeedBuilder from './CustomFeedBuilder';
import { CustomFeed, CustomFeedPlaybackState } from '@/types/customFeed';
import { customFeedStorage } from '@/lib/customFeedStorage';

type FeedType = 'latest' | 'top' | 'favorites' | 'search' | 'custom';

export default function FeedLoader() {
  const [items, setItems] = useState<SoraFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedType, setFeedType] = useState<FeedType>('latest');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Custom feed state
  const [customFeeds, setCustomFeeds] = useState<CustomFeed[]>([]);
  const [selectedCustomFeed, setSelectedCustomFeed] = useState<CustomFeed | null>(null);
  const [customFeedPlayback, setCustomFeedPlayback] = useState<CustomFeedPlaybackState | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<CustomFeed | null>(null);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      setSelectedCustomFeed(feed);
      // Restart playback with updated feed - will be handled by useEffect
    }
  };

  const handleDeleteCustomFeed = useCallback((feedId: string) => {
    if (confirm('Are you sure you want to delete this custom feed?')) {
      customFeedStorage.delete(feedId);
      loadCustomFeeds();
      
      // If we deleted the currently selected feed, reset
      if (selectedCustomFeed && selectedCustomFeed.id === feedId) {
        setSelectedCustomFeed(null);
        setCustomFeedPlayback(null);
        if (feedType === 'custom') {
          // Clear timer and switch to latest
          if (playbackTimerRef.current) {
            clearTimeout(playbackTimerRef.current);
            playbackTimerRef.current = null;
          }
          setFeedType('latest');
          setIsDropdownOpen(false);
          loadFeed('latest');
        }
      }
    }
  }, [selectedCustomFeed, feedType, loadCustomFeeds]);

  const handleEditCustomFeed = useCallback((feed: CustomFeed) => {
    setEditingFeed(feed);
    setIsBuilderOpen(true);
  }, []);

  const handleCreateNewFeed = useCallback(() => {
    setEditingFeed(null);
    setIsBuilderOpen(true);
  }, []);

  const loadCustomFeedBlock = async (searchQuery: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=50`);
      if (!response.ok) {
        throw new Error('Failed to search database');
      }
      const data = await response.json();
      console.log('✅ Loaded', data.items?.length || 0, 'results for custom feed block:', searchQuery);
      
      // Shuffle results for random playback
      const shuffled = (data.items || []).sort(() => Math.random() - 0.5);
      setItems(shuffled);
      setCursor(null);
      setHasMore(false);
    } catch (err) {
      console.error('❌ Custom feed block load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load custom feed block');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // Smart timing function that considers video duration and rounding
  const calculateNextTransition = useCallback((blockDurationSeconds: number, videoDurationSeconds: number, elapsedSeconds: number) => {
    const remainingBlockTime = blockDurationSeconds - elapsedSeconds;
    
    // If video is between 10-25 seconds as specified
    if (videoDurationSeconds >= 10 && videoDurationSeconds <= 25) {
      // Round video duration to nearest 15 seconds
      const roundedVideoDuration = Math.round(videoDurationSeconds / 15) * 15;
      
      // If rounded duration fits in remaining block time, use it
      if (roundedVideoDuration <= remainingBlockTime) {
        return roundedVideoDuration * 1000; // Convert to milliseconds
      }
    }
    
    // Default: use remaining block time
    return remainingBlockTime * 1000;
  }, []);

  const scheduleNextVideoOrBlock = useCallback((feed: CustomFeed, currentIndex: number, startPlayback: (f: CustomFeed) => void) => {
    const currentBlock = feed.blocks[currentIndex];
    if (!currentBlock || !customFeedPlayback) return;

    const elapsedTime = (Date.now() - customFeedPlayback.blockStartTime) / 1000;
    const remainingBlockTime = currentBlock.durationSeconds - elapsedTime;

    // If block time is up, move to next block
    if (remainingBlockTime <= 0) {
      const nextIndex = currentIndex + 1;

      if (nextIndex >= feed.blocks.length) {
        if (feed.loop) {
          startPlayback(feed);
        } else {
          setCustomFeedPlayback(null);
        }
      } else {
        const nextBlock = feed.blocks[nextIndex];
        const newState: CustomFeedPlaybackState = {
          currentBlockIndex: nextIndex,
          blockStartTime: Date.now(),
          currentSearchQuery: nextBlock.searchQuery,
          blockElapsedTime: 0,
          currentVideoStartTime: Date.now(),
          currentVideoDuration: 0,
        };

        setCustomFeedPlayback(newState);
        loadCustomFeedBlock(nextBlock.searchQuery);
        scheduleNextVideoOrBlock(feed, nextIndex, startPlayback);
      }
      return;
    }

    // Calculate when to check again (either video end or block end)
    const checkInterval = Math.min(remainingBlockTime * 1000, 15000); // Check at least every 15 seconds

    playbackTimerRef.current = setTimeout(() => {
      scheduleNextVideoOrBlock(feed, currentIndex, startPlayback);
    }, checkInterval);
  }, [customFeedPlayback, calculateNextTransition]);

  const scheduleNextBlock = useCallback((feed: CustomFeed, currentIndex: number, startPlayback: (f: CustomFeed) => void) => {
    // Use the new smart scheduling
    scheduleNextVideoOrBlock(feed, currentIndex, startPlayback);
  }, [scheduleNextVideoOrBlock]);

  const startCustomFeedPlayback = useCallback((feed: CustomFeed) => {
    // Clear any existing timer
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
    }

    // Initialize playback state
    const initialState: CustomFeedPlaybackState = {
      currentBlockIndex: 0,
      blockStartTime: Date.now(),
      currentSearchQuery: feed.blocks[0]?.searchQuery || '',
      blockElapsedTime: 0,
      currentVideoStartTime: Date.now(),
      currentVideoDuration: 0,
    };

    setCustomFeedPlayback(initialState);
    setSelectedCustomFeed(feed);

    // Load initial search results
    if (feed.blocks[0]) {
      loadCustomFeedBlock(feed.blocks[0].searchQuery);
      
      // Schedule next block transition
      scheduleNextBlock(feed, 0, startCustomFeedPlayback);
    }
  }, [scheduleNextBlock]);

  // Handle video events for custom feed timing
  const handleCustomFeedVideoEvent = useCallback((eventType: 'loadedmetadata' | 'ended', videoDuration?: number) => {
    if (feedType !== 'custom' || !customFeedPlayback || !selectedCustomFeed) return;

    if (eventType === 'loadedmetadata' && videoDuration) {
      // Update playback state with video duration
      setCustomFeedPlayback(prev => prev ? {
        ...prev,
        currentVideoDuration: videoDuration,
        currentVideoStartTime: Date.now(),
      } : null);
    } else if (eventType === 'ended') {
      // Video ended, decide whether to play another video or move to next block
      const currentBlock = selectedCustomFeed.blocks[customFeedPlayback.currentBlockIndex];
      if (!currentBlock) return;

      const elapsedTime = (Date.now() - customFeedPlayback.blockStartTime) / 1000;
      const remainingBlockTime = currentBlock.durationSeconds - elapsedTime;

      // If there's still significant time left in the block (more than 15 seconds), 
      // load another video from the same search
      if (remainingBlockTime > 15) {
        // Reload the same search to get a new random video
        loadCustomFeedBlock(currentBlock.searchQuery);
        
        // Update the video start time
        setCustomFeedPlayback(prev => prev ? {
          ...prev,
          currentVideoStartTime: Date.now(),
          currentVideoDuration: 0,
        } : null);
      } else {
        // Close to block end, let the timer handle the transition
        // The scheduleNextVideoOrBlock will handle the transition
      }
    }
  }, [feedType, customFeedPlayback, selectedCustomFeed]);

  const loadFeed = async (type: FeedType = feedType, reset: boolean = true) => {
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
        
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=50`);
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
      const data = await fetchFeed(20, cut);
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
  };

  const loadMoreFeed = async () => {
    if (!hasMore || loadingMore || !cursor) return;
    
    try {
      setLoadingMore(true);
      console.log('🔄 Loading more feed data with cursor...');
      
      const cut = feedType === 'top' ? 'nf2_top' : 'nf2_latest';
      const data = await fetchFeed(20, cut, cursor);
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
    // Clear any existing custom feed playback timer
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }

    setFeedType(type);
    setIsDropdownOpen(false);
    
    if (type === 'search') {
      setSearchExpanded(true);
      setCustomFeedPlayback(null);
      setSelectedCustomFeed(null);
    } else if (type === 'custom' && customFeed) {
      setSearchExpanded(false);
      startCustomFeedPlayback(customFeed);
    } else {
      setSearchExpanded(false);
      setCustomFeedPlayback(null);
      setSelectedCustomFeed(null);
      await loadFeed(type);
    }
  };

  const handleSearch = async () => {
    if (searchInput.trim().length === 0) return;
    setSearchQuery(searchInput.trim());
    setFeedType('search');
    setLoading(true);
    setError(null);
    setCursor(null);
    setHasMore(false);
    
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchInput.trim())}&limit=50`);
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

  // Restart playback when selected feed is updated while playing
  useEffect(() => {
    if (feedType === 'custom' && selectedCustomFeed && customFeedPlayback) {
      // Feed was updated, restart playback
      startCustomFeedPlayback(selectedCustomFeed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomFeed?.updatedAt]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadFeed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {customFeedPlayback && selectedCustomFeed && (
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
            {selectedCustomFeed.loop && (
              <>
                <div className="w-px h-4 bg-white/30" />
                <span className="text-xs opacity-75">Looping</span>
              </>
            )}
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
        key={`${feedType}-${searchQuery}-${selectedCustomFeed?.id || ''}`} // Force remount when feed type or search changes
        items={items} 
        onLoadMore={loadMoreFeed}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onAddToFavorites={addToFavorites}
        onRemoveFromFavorites={removeFromFavorites}
        isInFavorites={isInFavorites}
        onControlsChange={setShowControls}
        onCustomFeedVideoEvent={feedType === 'custom' ? handleCustomFeedVideoEvent : undefined}
      />
    </>
  );
}
