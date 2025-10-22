import { NextRequest, NextResponse } from 'next/server';
import { SoraFeedResponse, SoraFeedItem } from '@/types/sora';
import { getClient } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const format = searchParams.get('format') || 'both'; // 'both', 'tall', 'wide'

    console.log('🔍 Fetching latest posts from database:', { limit, offset, format });

    const client = await getClient();
    
    // Build format filtering conditions
    let formatConditions = '';
    if (format === 'wide') {
      formatConditions = ' WHERE p.width > p.height';
    } else if (format === 'tall') {
      formatConditions = ' WHERE p.height > p.width';
    }
    // 'both' means no additional filtering
    
    // Query for latest posts with creator info using JOIN on normalized schema
    const query = `
      SELECT 
        p.id,
        p.text,
        p.posted_at,
        p.permalink,
        p.video_url,
        p.video_url_md,
        p.thumbnail_url,
        p.gif_url,
        p.width,
        p.height,
        p.generation_id,
        p.task_id,
        c.id as creator_id,
        c.username,
        c.display_name,
        c.profile_picture_url,
        c.permalink as creator_permalink,
        c.follower_count,
        c.following_count,
        c.post_count,
        c.verified
      FROM sora_posts p
      JOIN creators c ON p.creator_id = c.id
      ${formatConditions}
      ORDER BY p.posted_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await client.query(query, [limit, offset]);
    
    // Transform database results to SoraFeedItem format (reconstruct post and profile objects)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: SoraFeedItem[] = result.rows.map((row: any) => ({
      post: {
        id: row.id,
        text: row.text,
        posted_at: row.posted_at,
        permalink: row.permalink,
        attachments: [{
          generation_id: row.generation_id,
          task_id: row.task_id,
          width: row.width,
          height: row.height,
          encodings: {
            source: { path: row.video_url },
            md: { path: row.video_url_md },
            thumbnail: { path: row.thumbnail_url },
            gif: { path: row.gif_url }
          }
        }]
      },
      profile: {
        user_id: row.creator_id,
        username: row.username,
        display_name: row.display_name,
        profile_picture_url: row.profile_picture_url,
        permalink: row.creator_permalink,
        follower_count: row.follower_count,
        following_count: row.following_count,
        post_count: row.post_count,
        verified: row.verified
      }
    }));

    console.log(`✅ Found ${items.length} latest posts from database`);

    // Check if there are more items for pagination
    const countQuery = `SELECT COUNT(*) as total FROM sora_posts p${formatConditions}`;
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
