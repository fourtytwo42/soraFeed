'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface RefreshButtonProps {
  onRefresh: () => Promise<void>;
}

export default function RefreshButton({ onRefresh }: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="fixed top-4 right-4 z-50 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-50 transition-all"
      title="Refresh feed"
    >
      <RotateCcw 
        size={20} 
        className={isRefreshing ? 'animate-spin' : ''} 
      />
    </button>
  );
}
