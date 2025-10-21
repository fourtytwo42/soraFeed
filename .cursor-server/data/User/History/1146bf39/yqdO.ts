import { NextRequest, NextResponse } from 'next/server';
import { SoraFeedResponse, SoraFeedItem } from '@/types/sora';
import { getClient } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('🔍 Fetching latest posts from database:', { limit, offset });

    const client = await getClient();
    
    // Query for latest posts ordered by posted_at descending
    const query = `
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
      WHERE post_data IS NOT NULL 
        AND profile_data IS NOT NULL
      ORDER BY posted_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await client.query(query, [limit, offset]);
    
    // Transform database results to SoraFeedItem format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: SoraFeedItem[] = result.rows.map((row: any) => ({
      post: row.post_data,
      profile: row.profile_data,
    }));

    console.log(`✅ Found ${items.length} latest posts from database`);

    // Check if there are more items for pagination
    const countQuery = 'SELECT COUNT(*) as total FROM sora_posts WHERE post_data IS NOT NULL AND profile_data IS NOT NULL';
    const countResult = await client.query(countQuery);
    const totalCount = parseInt(countResult.rows[0].total);
    const hasMore = (offset + limit) < totalCount;

    const response: SoraFeedResponse = {
      items,
      cursor: hasMore ? (offset + limit).toString() : null,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('💥 Database latest feed error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
