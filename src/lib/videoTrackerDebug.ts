/**
 * Debug utilities for the Video Tracker
 * Use these functions in the browser console for debugging
 */

import { videoTracker } from './videoTracker';

// Make these available globally for debugging
declare global {
  interface Window {
    videoTrackerDebug: {
      getStats: () => void;
      clearAll: () => void;
      getSeenCount: () => number;
      removeOld: (days: number) => void;
      logRecentVideos: (count?: number) => void;
    };
  }
}

export const videoTrackerDebug = {
  /**
   * Log current video tracker statistics
   */
  getStats() {
    const stats = videoTracker.getStats();
    console.log('📊 Video Tracker Statistics:', {
      totalVideos: stats.total,
      oldestVideo: stats.oldestTimestamp ? new Date(stats.oldestTimestamp).toLocaleString() : 'None',
      newestVideo: stats.newestTimestamp ? new Date(stats.newestTimestamp).toLocaleString() : 'None',
      ageSpan: stats.oldestTimestamp && stats.newestTimestamp 
        ? `${Math.round((stats.newestTimestamp - stats.oldestTimestamp) / (1000 * 60 * 60 * 24))} days`
        : 'N/A'
    });
    return stats;
  },

  /**
   * Clear all seen videos
   */
  clearAll() {
    videoTracker.clear();
    console.log('🗑️ Cleared all seen videos');
  },

  /**
   * Get count of seen videos
   */
  getSeenCount() {
    const count = videoTracker.getSeenCount();
    console.log(`📼 Currently tracking ${count} seen videos`);
    return count;
  },

  /**
   * Remove videos older than specified days
   */
  removeOld(days: number = 7) {
    console.log(`🧹 Removing videos older than ${days} days...`);
    videoTracker.removeOlderThan(days);
    this.getStats();
  },

  /**
   * Log information about recently seen videos
   */
  logRecentVideos(count: number = 10) {
    const stats = videoTracker.getStats();
    console.log(`📋 Video Tracker has ${stats.total} videos tracked`);
    
    if (stats.newestTimestamp) {
      const recentThreshold = Date.now() - (24 * 60 * 60 * 1000); // Last 24 hours
      console.log(`🕒 Videos seen in last 24 hours: checking...`);
    }
  }
};

// Make debug functions available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.videoTrackerDebug = videoTrackerDebug;
  console.log('🔧 Video Tracker Debug utilities available at window.videoTrackerDebug');
}
