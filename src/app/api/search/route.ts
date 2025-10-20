import { NextRequest, NextResponse } from 'next/server';
import { SoraFeedResponse, SoraFeedItem } from '@/types/sora';
import { getClient } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Searching database for:', query);

    const client = await getClient();
    
    // Search using PostgreSQL full-text search
    const searchQuery = `
      SELECT 
        post_data,
        profile_data,
        text,
        posted_at,
        updated_at,
        like_count,
        view_count,
        remix_count,
        permalink
      FROM sora_posts
      WHERE to_tsvector('english', COALESCE(text, '')) @@ plainto_tsquery('english', $1)
      ORDER BY posted_at DESC
      LIMIT $2
    `;

    const result = await client.query(searchQuery, [query, limit]);
    
    // Transform database results to SoraFeedItem format
    const items: SoraFeedItem[] = result.rows.map((row: any) => ({
      post: row.post_data,
      profile: row.profile_data,
    }));

    console.log(`✅ Found ${items.length} results for query: "${query}"`);

    const response: SoraFeedResponse = {
      items,
      cursor: null, // Search doesn't support pagination yet
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('💥 Search error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

