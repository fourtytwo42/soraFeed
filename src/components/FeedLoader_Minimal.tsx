'use client';

import React, { useState, useEffect } from 'react';

export default function FeedLoaderMinimal() {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    console.log('🚀 Minimal FeedLoader: useEffect triggered');
    
    const test = async () => {
      try {
        console.log('🚀 Minimal FeedLoader: Starting test...');
        setStatus('fetching');
        
        // Simple delay to test if state updates work
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Minimal FeedLoader: Test complete');
        setStatus('success');
      } catch (err) {
        console.error('❌ Minimal FeedLoader: Error:', err);
        setStatus('error');
      }
    };

    test();
  }, []);

  console.log('🔄 Minimal FeedLoader render, status:', status);

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="text-white text-2xl mb-4">
          Status: {status}
        </div>
        {status === 'loading' && (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        )}
        {status === 'fetching' && (
          <div className="text-yellow-400">Fetching...</div>
        )}
        {status === 'success' && (
          <div className="text-green-400">Success!</div>
        )}
        {status === 'error' && (
          <div className="text-red-400">Error!</div>
        )}
      </div>
    </div>
  );
}
