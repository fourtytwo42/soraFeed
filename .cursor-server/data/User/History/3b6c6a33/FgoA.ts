/**
 * Server-side cache for API responses
 * Cache duration: 5 minutes
 */

interface CachedData<T> {
  data: T;
  timestamp: number;
}

class ServerCache {
  private cache: Map<string, CachedData<any>> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get data from cache if valid, otherwise return null
   */
  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    
    if (age > this.CACHE_DURATION) {
      // Cache expired, remove it
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Store data in cache with current timestamp
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    for (const cached of this.cache.values()) {
      if (now - cached.timestamp > this.CACHE_DURATION) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
    };
  }
}

// Export singleton instance
export const serverCache = new ServerCache();

// Cleanup expired entries every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    serverCache.cleanup();
  }, 60 * 1000);
}

