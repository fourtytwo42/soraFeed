import { SoraFeedResponse } from '@/types/sora';

export async function fetchFeed(limit: number = 16, cut: string = 'nf2_latest'): Promise<SoraFeedResponse> {
  const response = await fetch(`/api/feed?limit=${limit}&cut=${cut}`, {
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
