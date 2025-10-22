import { SoraFeedItem } from '@/types/sora';
import { fetchRemixFeed } from './api';

interface CachedRemixFeed {
  data: SoraFeedItem[];
  timestamp: number;
  postId: string;
}

interface FetchQueueItem {
  postId: string;
  priority: number;
  retryCount: number;
}

class RemixCacheManager {
  private cache: Map<string, CachedRemixFeed> = new Map();
  private fetchQueue: FetchQueueItem[] = [];
  private isFetching: boolean = false;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RETRIES = 2; // Reduced from 3 to 2
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly CONCURRENT_FETCHES = 2;
  private activeFetches: Set<string> = new Set();
  
  // Circuit breaker for problematic posts
  private failedPosts: Map<string, { count: number; lastFailed: number }> = new Map();
  private readonly FAILURE_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_DURATION = 10 * 60 * 1000; // 10 minutes

  /**
   * Get remix feed from cache or fetch if not cached/expired
   */
  async getRemixFeed(postId: string): Promise<SoraFeedItem[]> {
    const cached = this.cache.get(postId);
    
    // Check if cache is valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      // console.log('✅ Cache hit for remix feed:', postId);
      return cached.data;
    }

    // Check circuit breaker
    const failureInfo = this.failedPosts.get(postId);
    if (failureInfo && 
        failureInfo.count >= this.FAILURE_THRESHOLD && 
        Date.now() - failureInfo.lastFailed < this.CIRCUIT_BREAKER_DURATION) {
      console.log('🚫 Circuit breaker active for:', postId, '(using cache/empty)');
      return cached ? cached.data : [];
    }

    // Cache miss or expired
    // console.log('❌ Cache miss for remix feed:', postId, cached ? '(expired)' : '(not cached)');
    
    // Try to fetch
    try {
      const response = await fetchRemixFeed(postId, 20);
      const remixes = response.items || [];
      
      // Cache the result
      this.cache.set(postId, {
        data: remixes,
        timestamp: Date.now(),
        postId,
      });
      
      // Reset failure count on successful fetch
      this.failedPosts.delete(postId);
      
      return remixes;
    } catch (error) {
      // Handle different types of errors more gracefully
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          console.log('⏱️ Remix feed timeout for:', postId, '(using cache/empty)');
        } else if (error.message.includes('fetch') || error.message.includes('network')) {
          console.log('🌐 Network error fetching remix feed:', postId, '(using cache/empty)');
        } else {
          console.error('❌ Failed to fetch remix feed:', postId, error.message);
        }
      } else {
        console.log('⚠️ Unknown error fetching remix feed:', postId, '(using cache/empty)');
      }
      
      // Track failure for circuit breaker
      const currentFailure = this.failedPosts.get(postId) || { count: 0, lastFailed: 0 };
      this.failedPosts.set(postId, {
        count: currentFailure.count + 1,
        lastFailed: Date.now()
      });
      
      // Return expired cache if available
      if (cached) {
        console.log('📦 Using cached remix feed for:', postId);
        return cached.data;
      }
      
      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Preload remix feeds for a list of posts
   */
  preloadRemixFeeds(posts: SoraFeedItem[]) {
    // console.log('📦 Queueing', posts.length, 'posts for remix preload');
    
    // Add posts to queue with priority based on order
    posts.forEach((post, index) => {
      const postId = post.post.id;
      
      // Skip if already cached and valid
      const cached = this.cache.get(postId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        // console.log('⏩ Skipping preload for cached:', postId);
        return;
      }
      
      // Skip if already in queue
      if (this.fetchQueue.some(item => item.postId === postId)) {
        return;
      }
      
      this.fetchQueue.push({
        postId,
        priority: index, // Lower number = higher priority
        retryCount: 0,
      });
    });
    
    // Sort queue by priority
    this.fetchQueue.sort((a, b) => a.priority - b.priority);
    
    // Start processing queue
    this.processQueue();
  }

  /**
   * Process the fetch queue with concurrent fetches
   */
  private async processQueue() {
    if (this.isFetching) {
      return; // Already processing
    }
    
    this.isFetching = true;
    
    while (this.fetchQueue.length > 0 || this.activeFetches.size > 0) {
      // Start new fetches up to concurrent limit
      while (
        this.fetchQueue.length > 0 && 
        this.activeFetches.size < this.CONCURRENT_FETCHES
      ) {
        const item = this.fetchQueue.shift()!;
        this.fetchWithRetry(item);
      }
      
      // Wait a bit before checking again
      await this.sleep(100);
    }
    
    this.isFetching = false;
    // console.log('✅ Remix preload queue completed');
  }

  /**
   * Fetch remix feed with retry logic
   */
  private async fetchWithRetry(item: FetchQueueItem) {
    const { postId, retryCount } = item;
    
    // Skip if already cached
    const cached = this.cache.get(postId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return;
    }
    
    // Check circuit breaker for background fetches too
    const failureInfo = this.failedPosts.get(postId);
    if (failureInfo && 
        failureInfo.count >= this.FAILURE_THRESHOLD && 
        Date.now() - failureInfo.lastFailed < this.CIRCUIT_BREAKER_DURATION) {
      console.log('🚫 Circuit breaker active for background fetch:', postId);
      return;
    }
    
    this.activeFetches.add(postId);
    
    try {
      // console.log(`🔄 Fetching remix feed for ${postId} (attempt ${retryCount + 1})`);
      
      const response = await fetchRemixFeed(postId, 20);
      const remixes = response.items || [];
      
      // Cache the result
      this.cache.set(postId, {
        data: remixes,
        timestamp: Date.now(),
        postId,
      });
      
      // Reset failure count on successful background fetch
      this.failedPosts.delete(postId);
      
      // console.log(`✅ Cached ${remixes.length} remixes for ${postId}`);
      
    } catch (error) {
      // Handle different types of errors more gracefully in background fetching
      let shouldRetry = true;
      
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          console.log(`⏱️ Background remix feed timeout for ${postId} (attempt ${retryCount + 1})`);
        } else if (error.message.includes('fetch') || error.message.includes('network')) {
          console.log(`🌐 Background network error for ${postId} (attempt ${retryCount + 1})`);
        } else {
          console.error(`❌ Background fetch error for ${postId}:`, error.message);
          // Don't retry for non-network errors
          shouldRetry = false;
        }
      } else {
        console.log(`⚠️ Unknown background error for ${postId} (attempt ${retryCount + 1})`);
      }
      
      // Track failure for circuit breaker (only for retryable errors)
      if (shouldRetry) {
        const currentFailure = this.failedPosts.get(postId) || { count: 0, lastFailed: 0 };
        this.failedPosts.set(postId, {
          count: currentFailure.count + 1,
          lastFailed: Date.now()
        });
      }
      
      // Retry if under max retries and it's a retryable error
      if (shouldRetry && retryCount < this.MAX_RETRIES) {
        // console.log(`🔄 Retrying ${postId} (${retryCount + 1}/${this.MAX_RETRIES})`);
        
        // Wait before retry with exponential backoff
        await this.sleep(this.RETRY_DELAY * Math.pow(2, retryCount));
        
        // Re-add to queue with increased retry count
        this.fetchQueue.push({
          ...item,
          retryCount: retryCount + 1,
        });
      } else if (shouldRetry) {
        console.log(`⏭️ Max retries exceeded for ${postId} (will use empty/cached)`);
      }
    } finally {
      this.activeFetches.delete(postId);
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    let cleared = 0;
    
    for (const [postId, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= this.CACHE_DURATION) {
        this.cache.delete(postId);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      console.log(`🧹 Cleared ${cleared} expired cache entries`);
    }
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
    console.log('🧹 Cleared all remix cache');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    const now = Date.now();
    const valid = Array.from(this.cache.values()).filter(
      c => now - c.timestamp < this.CACHE_DURATION
    ).length;
    
    return {
      total: this.cache.size,
      valid,
      expired: this.cache.size - valid,
      queueLength: this.fetchQueue.length,
      activeFetches: this.activeFetches.size,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const remixCache = new RemixCacheManager();

// Clear expired cache every minute
if (typeof window !== 'undefined') {
  setInterval(() => {
    remixCache.clearExpiredCache();
  }, 60 * 1000);
}

