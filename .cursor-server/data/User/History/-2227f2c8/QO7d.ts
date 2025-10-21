import { SoraFeedResponse, SoraRemixTree } from '@/types/sora';

export async function fetchFeed(limit: number = 16, cut: string = 'nf2_latest', cursor?: string): Promise<SoraFeedResponse> {
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
