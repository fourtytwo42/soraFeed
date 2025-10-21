'use client';

import { useState, useEffect, useRef } from 'react';
import { SoraFeedItem } from '@/types/sora';
import { fetchFeed } from '@/lib/api';
import { remixCache } from '@/lib/remixCache';
import VerticalCarousel from './VerticalCarousel';
import RemixCacheDebug from './RemixCacheDebug';
import { mockFeedData } from '@/lib/mockData';
import { ChevronDown } from 'lucide-react';

type FeedType = 'latest' | 'top' | 'favorites' | 'search';

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
      const data = await fetchFeed(16, cut);
      console.log('✅ Loaded', data.items?.length || 0, 'feed items');
      
      if (data.items && data.items.length > 0) {
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
      const data = await fetchFeed(16, cut, cursor);
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

  const handleFeedTypeChange = async (type: FeedType) => {
    setFeedType(type);
    setIsDropdownOpen(false);
    
    if (type === 'search') {
      setSearchExpanded(true);
    } else {
      setSearchExpanded(false);
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
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 flex-shrink-0 ${
                  feedType === 'latest'
                    ? 'bg-white text-black'
                    : feedType === 'top'
                    ? 'bg-white text-black'
                    : feedType === 'favorites'
                    ? 'bg-white text-black'
                    : feedType === 'search'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/20'
                }`}
              >
                <span>
                  {feedType === 'latest' ? 'Latest' : 
                   feedType === 'top' ? 'Top' : 
                   feedType === 'favorites' ? 'Favorites' : 
                   feedType === 'search' ? 'Search' : 'Latest'}
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
                    className="px-3 py-2 bg-white text-black rounded-full text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    Search
                  </button>
                </div>
              )}
            </div>

            {/* Dropdown Menu */}
            {isDropdownOpen && showControls && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-black/50 backdrop-blur-sm rounded-2xl p-2 min-w-full shadow-lg">
                {feedType !== 'latest' && (
                  <button
                    onClick={() => handleFeedTypeChange('latest')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap"
                  >
                    Latest
                  </button>
                )}
                {feedType !== 'top' && (
                  <button
                    onClick={() => handleFeedTypeChange('top')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap"
                  >
                    Top
                  </button>
                )}
                {feedType !== 'favorites' && (
                  <button
                    onClick={() => handleFeedTypeChange('favorites')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap"
                  >
                    Favorites
                  </button>
                )}
                {feedType !== 'search' && (
                  <button
                    onClick={() => handleFeedTypeChange('search')}
                    className="w-full text-left px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap"
                  >
                    Search
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <VideoFeed 
        key={`${feedType}-${searchQuery}`} // Force remount when feed type or search changes
        items={items} 
        onLoadMore={loadMoreFeed}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onAddToFavorites={addToFavorites}
        onRemoveFromFavorites={removeFromFavorites}
        isInFavorites={isInFavorites}
        onControlsChange={setShowControls}
      />
    </>
  );
}
