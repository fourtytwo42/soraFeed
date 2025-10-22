import { SoraFeedResponse, SoraRemixTree, SoraFeedItem } from '@/types/sora';

export async function fetchFeed(limit: number = 100, cut: string = 'nf2_latest', cursor?: string, format: string = 'both'): Promise<SoraFeedResponse> {
  console.log('🔀 fetchFeed routing:', { cut, limit, format, cursor: cursor ? 'present' : 'none' });
  
  // Use database for latest feed, Sora API for top feed
  if (cut === 'nf2_latest') {
    console.log('📊 Routing to database (latest feed)');
    return fetchLatestFeedFromDatabase(limit, cursor, format);
  }
  
  // For top feed, use Sora API (external API doesn't support format filtering)
  // We'll fetch more items and filter client-side if needed
  console.log('🌐 Routing to Sora API (top feed)');
  const fetchLimit = 200; // Always fetch 200 for top feed to ensure enough variety after filtering
  
  const params = new URLSearchParams({
    limit: fetchLimit.toString(),
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

  const data = await response.json();
  let allItems = data.items || [];
  let currentCursor = data.cursor;
  
  // Apply format filtering client-side for top feed (since external API doesn't support it)
  if (format !== 'both' && allItems.length > 0) {
    let filteredItems = allItems.filter((item: SoraFeedItem) => {
      const attachment = item.post.attachments[0];
      if (!attachment || !attachment.width || !attachment.height) return true;
      
      const isWide = attachment.width > attachment.height;
      const isTall = attachment.height > attachment.width;
      
      if (format === 'wide') return isWide;
      if (format === 'tall') return isTall;
      return true;
    });
    
    console.log(`🔍 Initial filter: ${filteredItems.length}/${allItems.length} items (${format} format)`);
    
    // If we don't have enough filtered items and there's more data available, fetch more pages
    let attempts = 0;
    const maxAttempts = 3; // Limit to prevent infinite loops
    
    while (filteredItems.length < Math.min(limit, 50) && currentCursor && attempts < maxAttempts) {
      attempts++;
      console.log(`🔄 Need more ${format} videos, fetching page ${attempts + 1}...`);
      
      try {
        const nextParams = new URLSearchParams({
          limit: '200',
          cut,
          cursor: currentCursor,
        });
        
        const nextResponse = await fetch(`/api/feed?${nextParams.toString()}`, {
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (nextResponse.ok) {
          const nextData = await nextResponse.json();
          const nextItems = nextData.items || [];
          
          if (nextItems.length > 0) {
            allItems = [...allItems, ...nextItems];
            currentCursor = nextData.cursor;
            
            // Filter the new combined items
            const newFilteredItems = allItems.filter((item: SoraFeedItem) => {
              const attachment = item.post.attachments[0];
              if (!attachment || !attachment.width || !attachment.height) return true;
              
              const isWide = attachment.width > attachment.height;
              const isTall = attachment.height > attachment.width;
              
              if (format === 'wide') return isWide;
              if (format === 'tall') return isTall;
              return true;
            });
            
            filteredItems = newFilteredItems;
            console.log(`🔍 After page ${attempts + 1}: ${filteredItems.length}/${allItems.length} items (${format} format)`);
          } else {
            console.log('📄 No more items available from API');
            break;
          }
        } else {
          console.log('❌ Failed to fetch additional page');
          break;
        }
      } catch (error) {
        console.log('❌ Error fetching additional page:', error);
        break;
      }
    }
    
    // Limit to requested amount after filtering and pagination
    data.items = filteredItems.slice(0, limit);
    // Keep the cursor for potential future pagination
    data.cursor = currentCursor;
    
    console.log(`✅ Final top feed result: ${data.items.length} items (${format} format)`);
  } else {
    // No filtering needed, just limit the results
    data.items = allItems.slice(0, limit);
  }

  return data;
}

export async function fetchLatestFeedFromDatabase(limit: number = 100, cursor?: string, format: string = 'both'): Promise<SoraFeedResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  
  if (cursor) {
    params.append('offset', cursor);
  }
  
  if (format !== 'both') {
    params.append('format', format);
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
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout (increased from 5)
  
  try {
    const response = await fetch(`/api/post/${postId}/remix_feed?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch remix feed: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Remix feed request timeout');
    }
    
    throw error;
  }
}
