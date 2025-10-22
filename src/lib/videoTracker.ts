/**
 * Video Tracker - Manages seen video IDs in localStorage
 * Keeps track of the last 500 videos seen to avoid repetition
 */

const STORAGE_KEY = 'soraSeenVideos';
const MAX_SEEN_VIDEOS = 500;

interface SeenVideoEntry {
  id: string;
  timestamp: number;
}

export class VideoTracker {
  private static instance: VideoTracker;
  private seenVideos: Map<string, number> = new Map();

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): VideoTracker {
    if (!VideoTracker.instance) {
      VideoTracker.instance = new VideoTracker();
    }
    return VideoTracker.instance;
  }

  /**
   * Load seen videos from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const entries: SeenVideoEntry[] = JSON.parse(stored);
        // Sort by timestamp to maintain order
        entries.sort((a, b) => a.timestamp - b.timestamp);
        
        this.seenVideos.clear();
        entries.forEach(entry => {
          this.seenVideos.set(entry.id, entry.timestamp);
        });
        
        console.log(`📼 Loaded ${this.seenVideos.size} seen videos from storage`);
      }
    } catch (error) {
      console.error('Error loading seen videos from storage:', error);
      this.seenVideos.clear();
    }
  }

  /**
   * Save seen videos to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const entries: SeenVideoEntry[] = Array.from(this.seenVideos.entries()).map(([id, timestamp]) => ({
        id,
        timestamp
      }));
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('Error saving seen videos to storage:', error);
    }
  }

  /**
   * Mark a video as seen
   */
  markAsSeen(videoId: string): void {
    if (!videoId) return;
    
    const timestamp = Date.now();
    this.seenVideos.set(videoId, timestamp);
    
    // Clean up if we exceed the limit
    if (this.seenVideos.size > MAX_SEEN_VIDEOS) {
      this.cleanup();
    }
    
    this.saveToStorage();
  }

  /**
   * Mark multiple videos as seen
   */
  markMultipleAsSeen(videoIds: string[]): void {
    if (!videoIds || videoIds.length === 0) return;
    
    const timestamp = Date.now();
    videoIds.forEach(id => {
      if (id) {
        this.seenVideos.set(id, timestamp);
      }
    });
    
    // Clean up if we exceed the limit
    if (this.seenVideos.size > MAX_SEEN_VIDEOS) {
      this.cleanup();
    }
    
    this.saveToStorage();
  }

  /**
   * Check if a video has been seen
   */
  hasSeen(videoId: string): boolean {
    return this.seenVideos.has(videoId);
  }

  /**
   * Filter out seen videos from a list
   */
  filterUnseen<T extends { post: { id: string } }>(videos: T[]): T[] {
    return videos.filter(video => !this.hasSeen(video.post.id));
  }

  /**
   * Get count of seen videos
   */
  getSeenCount(): number {
    return this.seenVideos.size;
  }

  /**
   * Get count of unseen videos from a list
   */
  getUnseenCount<T extends { post: { id: string } }>(videos: T[]): number {
    return videos.filter(video => !this.hasSeen(video.post.id)).length;
  }

  /**
   * Clean up old entries to maintain the limit
   */
  private cleanup(): void {
    if (this.seenVideos.size <= MAX_SEEN_VIDEOS) return;
    
    // Convert to array and sort by timestamp (oldest first)
    const entries = Array.from(this.seenVideos.entries()).sort((a, b) => a[1] - b[1]);
    
    // Calculate how many to remove
    const toRemove = this.seenVideos.size - MAX_SEEN_VIDEOS;
    
    // Remove oldest entries
    for (let i = 0; i < toRemove; i++) {
      this.seenVideos.delete(entries[i][0]);
    }
    
    console.log(`🧹 Cleaned up ${toRemove} old seen videos, now tracking ${this.seenVideos.size} videos`);
  }

  /**
   * Clear all seen videos (useful for testing or reset)
   */
  clear(): void {
    this.seenVideos.clear();
    this.saveToStorage();
    console.log('🗑️ Cleared all seen videos');
  }

  /**
   * Get statistics about seen videos
   */
  getStats(): { total: number; oldestTimestamp: number | null; newestTimestamp: number | null } {
    if (this.seenVideos.size === 0) {
      return { total: 0, oldestTimestamp: null, newestTimestamp: null };
    }
    
    const timestamps = Array.from(this.seenVideos.values());
    return {
      total: this.seenVideos.size,
      oldestTimestamp: Math.min(...timestamps),
      newestTimestamp: Math.max(...timestamps)
    };
  }

  /**
   * Remove videos older than specified days
   */
  removeOlderThan(days: number): void {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    let removedCount = 0;
    
    for (const [id, timestamp] of this.seenVideos.entries()) {
      if (timestamp < cutoffTime) {
        this.seenVideos.delete(id);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.saveToStorage();
      console.log(`🗑️ Removed ${removedCount} videos older than ${days} days`);
    }
  }
}

// Export singleton instance
export const videoTracker = VideoTracker.getInstance();
