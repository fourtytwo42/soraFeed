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
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly CONCURRENT_FETCHES = 2;
  private activeFetches: Set<string> = new Set();

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
      
      return remixes;
    } catch (error) {
      console.error('❌ Failed to fetch remix feed:', postId, error);
      
      // Return expired cache if available
      if (cached) {
        console.log('⚠️ Returning expired cache for:', postId);
        return cached.data;
      }
      
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
      
      // console.log(`✅ Cached ${remixes.length} remixes for ${postId}`);
      
    } catch (error) {
      console.error(`❌ Failed to fetch remix feed for ${postId}:`, error);
      
      // Retry if under max retries
      if (retryCount < this.MAX_RETRIES) {
        // console.log(`🔄 Retrying ${postId} (${retryCount + 1}/${this.MAX_RETRIES})`);
        
        // Wait before retry
        await this.sleep(this.RETRY_DELAY * (retryCount + 1));
        
        // Re-add to queue with increased retry count
        this.fetchQueue.push({
          ...item,
          retryCount: retryCount + 1,
        });
      } else {
        console.error(`❌ Max retries exceeded for ${postId}`);
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

