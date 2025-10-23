interface PreloadRequest {
  videoUrl: string;
  postId: string;
  priority: number; // Lower number = higher priority
  element?: HTMLVideoElement;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

class VideoPreloadManager {
  private activePreloads: Map<string, PreloadRequest> = new Map();
  private readonly MAX_CONCURRENT_PRELOADS = 3; // Allow 3 videos to preload at once
  private readonly PRELOAD_TIMEOUT = 30000; // 30 seconds timeout

  /**
   * Request to preload a video with priority
   */
  requestPreload(request: PreloadRequest): boolean {
    // Check if already preloading this video
    if (this.activePreloads.has(request.videoUrl)) {
      console.log('🔄 Video already being preloaded:', request.postId);
      return false;
    }

    // Check if we're at capacity
    if (this.activePreloads.size >= this.MAX_CONCURRENT_PRELOADS) {
      // Cancel lowest priority preload if this one has higher priority
      const lowestPriority = Math.max(...Array.from(this.activePreloads.values()).map(p => p.priority));
      if (request.priority < lowestPriority) {
        // Find and cancel the lowest priority preload
        for (const [url, preload] of this.activePreloads.entries()) {
          if (preload.priority === lowestPriority) {
            console.log('🚫 Canceling lower priority preload for:', preload.postId);
            this.cancelPreload(url);
            break;
          }
        }
      } else {
        console.log('🚫 Preload queue full, skipping:', request.postId);
        return false;
      }
    }

    console.log('🚀 Starting video preload:', {
      postId: request.postId,
      priority: request.priority,
      activeCount: this.activePreloads.size
    });

    this.startPreload(request);
    return true;
  }

  /**
   * Cancel preload for a specific video URL
   */
  cancelPreload(videoUrl: string): void {
    const preload = this.activePreloads.get(videoUrl);
    if (preload && preload.element) {
      try {
        // Stop loading
        preload.element.src = '';
        preload.element.load();
        
        // Remove from DOM
        if (preload.element.parentNode) {
          preload.element.parentNode.removeChild(preload.element);
        }
        
        console.log('🛑 Canceled preload for:', preload.postId);
      } catch (error) {
        console.warn('Error canceling preload:', error);
      }
    }
    
    this.activePreloads.delete(videoUrl);
  }

  /**
   * Cancel all preloads for a specific post (when navigating away)
   */
  cancelPreloadsForPost(postId: string): void {
    const toCancel: string[] = [];
    
    for (const [url, preload] of this.activePreloads.entries()) {
      if (preload.postId === postId) {
        toCancel.push(url);
      }
    }
    
    toCancel.forEach(url => this.cancelPreload(url));
  }

  /**
   * Get current preload status
   */
  getStatus() {
    return {
      activeCount: this.activePreloads.size,
      maxConcurrent: this.MAX_CONCURRENT_PRELOADS,
      activePreloads: Array.from(this.activePreloads.values()).map(p => ({
        postId: p.postId,
        priority: p.priority
      }))
    };
  }

  private startPreload(request: PreloadRequest): void {
    // Create video element
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.style.display = 'none';
    video.crossOrigin = 'anonymous';

    // Set up timeout
    const timeoutId = setTimeout(() => {
      console.warn('⏱️ Preload timeout for:', request.postId);
      this.cancelPreload(request.videoUrl);
      request.onError?.(new Error('Preload timeout'));
    }, this.PRELOAD_TIMEOUT);

    // Set up event listeners
    const cleanup = () => {
      clearTimeout(timeoutId);
      this.activePreloads.delete(request.videoUrl);
    };

    video.addEventListener('canplaythrough', () => {
      console.log('✅ Video preloaded successfully:', request.postId);
      cleanup();
      request.onSuccess?.();
    }, { once: true });

    video.addEventListener('error', (e) => {
      console.warn('❌ Video preload failed:', request.postId, e);
      cleanup();
      request.onError?.(new Error(`Video preload failed: ${e.message || 'Unknown error'}`));
    }, { once: true });

    // Store the request with element
    const preloadWithElement = { ...request, element: video };
    this.activePreloads.set(request.videoUrl, preloadWithElement);

    // Start preloading
    video.src = request.videoUrl;
    document.body.appendChild(video);
  }

  /**
   * Clear all preloads (for cleanup)
   */
  clearAll(): void {
    const urls = Array.from(this.activePreloads.keys());
    urls.forEach(url => this.cancelPreload(url));
  }
}

// Singleton instance
export const videoPreloadManager = new VideoPreloadManager();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    videoPreloadManager.clearAll();
  });

  // Debug function for monitoring preload status
  (window as unknown as { getPreloadStatus?: () => { activeCount: number; maxConcurrent: number; activePreloads: { postId: string; priority: number; }[] } }).getPreloadStatus = () => {
    const status = videoPreloadManager.getStatus();
    console.log('📊 Video Preload Status:', status);
    return status;
  };
}
