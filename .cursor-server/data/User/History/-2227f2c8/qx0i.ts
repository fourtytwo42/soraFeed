import { SoraFeedResponse, SoraRemixTree } from '@/types/sora';

export async function fetchFeed(limit: number = 20, cut: string = 'nf2_latest', cursor?: string): Promise<SoraFeedResponse> {
  // Use database for latest feed, Sora API for top feed
  if (cut === 'nf2_latest') {
    return fetchLatestFeedFromDatabase(limit, cursor);
  }
  
  // For top feed, continue using Sora API
  const params = new URLSearchParams({
    limit: limit.toString(),
    cut,
  });
  
  if (cursor) {
    params.append('cursor', cursor);
  }
  
  const response = await fetch(`/api/feed?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch feed: ${response.status}`);
  }

  return response.json();
}

export async function fetchLatestFeedFromDatabase(limit: number = 20, cursor?: string): Promise<SoraFeedResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  
  if (cursor) {
    params.append('offset', cursor);
  }
  
  console.log('🌐 Fetching from database API:', `/api/feed/latest?${params.toString()}`);
  
  const response = await fetch(`/api/feed/latest?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch latest feed from database: ${response.status}`);
  }

  const data = await response.json();
  
  // 🔍 USERNAME LOGGING: Log API response data
  console.log('📥 Database API returned:', {
    itemCount: data.items?.length || 0,
    firstItem: data.items?.[0] ? {
      postId: data.items[0].post.id,
      username: data.items[0].profile.username,
      displayName: data.items[0].profile.display_name,
      userId: data.items[0].profile.user_id
    } : null,
    cursor: data.cursor
  });

  return data;
}

export async function fetchRemixTree(postId: string, limit: number = 20, maxDepth: number = 1): Promise<SoraRemixTree> {
  const response = await fetch(`/api/post/${postId}/tree?limit=${limit}&max_depth=${maxDepth}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch remix tree: ${response.status}`);
  }

  return response.json();
}

export async function fetchRemixFeed(postId: string, limit: number = 20, cursor?: string): Promise<SoraFeedResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  
  if (cursor) {
    params.append('cursor', cursor);
  }
  
  const response = await fetch(`/api/post/${postId}/remix_feed?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch remix feed: ${response.status}`);
  }

  return response.json();
}
