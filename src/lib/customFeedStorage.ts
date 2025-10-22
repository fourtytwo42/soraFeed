import { CustomFeed } from '@/types/customFeed';

const STORAGE_KEY = 'soraCustomFeeds';

export const customFeedStorage = {
  // Get all custom feeds
  getAll(): CustomFeed[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading custom feeds:', error);
      return [];
    }
  },

  // Get a specific feed by ID
  getById(id: string): CustomFeed | null {
    const feeds = this.getAll();
    return feeds.find(feed => feed.id === id) || null;
  },

  // Save a new feed or update existing
  save(feed: CustomFeed): void {
    if (typeof window === 'undefined') return;
    try {
      const feeds = this.getAll();
      const existingIndex = feeds.findIndex(f => f.id === feed.id);
      
      if (existingIndex >= 0) {
        feeds[existingIndex] = feed;
      } else {
        feeds.push(feed);
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(feeds));
    } catch (error) {
      console.error('Error saving custom feed:', error);
    }
  },

  // Delete a feed by ID
  delete(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      const feeds = this.getAll();
      const filtered = feeds.filter(f => f.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting custom feed:', error);
    }
  },

  // Check if a feed name already exists (for validation)
  nameExists(name: string, excludeId?: string): boolean {
    const feeds = this.getAll();
    return feeds.some(f => 
      f.name.toLowerCase() === name.toLowerCase() && 
      f.id !== excludeId
    );
  }
};

