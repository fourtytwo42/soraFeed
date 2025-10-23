'use client';

import React, { useState, useEffect } from 'react';
import { SoraFeedItem } from '@/types/sora';
import VerticalCarousel from './VerticalCarousel';

export default function FeedLoaderTest() {
  const [items, setItems] = useState<SoraFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFeed = async () => {
      try {
        console.log('🚀 Test FeedLoader: Starting to load feed...');
        setLoading(true);
        
        const response = await fetch('/api/feed/latest?limit=10&format=wide');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Test FeedLoader: Got data:', data);
        
        setItems(data.items || []);
        setError(null);
        console.log('✅ Test FeedLoader: Set items:', data.items?.length || 0);
      } catch (err) {
        console.error('❌ Test FeedLoader: Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        console.log('🏁 Test FeedLoader: Setting loading to false');
        setLoading(false);
      }
    };

    loadFeed();
  }, []);

  console.log('🔄 Test FeedLoader render:', { loading, itemsCount: items.length, error });

  if (loading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Test Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-semibold mb-2">Test Error</h2>
          <p className="text-white/70 text-sm mb-4">{error}</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg">No videos found</p>
        </div>
      </div>
    );
  }

  return (
    <VerticalCarousel
      items={items}
      onControlsChange={() => {}}
    />
  );
}
