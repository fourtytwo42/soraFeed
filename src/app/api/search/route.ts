import { NextRequest, NextResponse } from 'next/server';
import { SoraFeedResponse, SoraFeedItem } from '@/types/sora';
import { getClient } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50');
    const fast = searchParams.get('fast') === 'true';

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Searching database for:', query);

    const client = await getClient();
    
    // Enable pg_trgm extension for fuzzy matching if not already enabled
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    } catch (err) {
      // Extension might already exist, ignore error
      console.log('pg_trgm extension check:', err);
    }

    // Create GIN index on text for trigram similarity if not exists
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sora_posts_text_trgm 
        ON sora_posts USING gin(text gin_trgm_ops)
      `);
    } catch (err) {
      console.log('Trigram index check:', err);
    }

    // Choose search strategy based on fast parameter
    const searchQuery = fast ? `
      -- Ultra-fast search: minimal query for custom feeds
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
        c.verified,
        1.0 as text_relevance,
        0 as remix_score
      FROM sora_posts p
      JOIN creators c ON p.creator_id = c.id
      WHERE p.text ILIKE $1
      ORDER BY p.posted_at DESC
      LIMIT $2
    ` : `
      -- Advanced search query with multiple matching strategies using normalized schema:
      -- 1. Full-text search (ts_rank for relevance)
      -- 2. Partial match (ILIKE for case-insensitive substring)
      -- 3. Fuzzy match (similarity for typo tolerance)
      -- Results are weighted by: text relevance + remix count
      WITH search_results AS (
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
          c.verified,
          -- Calculate combined relevance score
          (
            -- Full-text search relevance (0-1 scale)
            COALESCE(ts_rank_cd(
              to_tsvector('english', COALESCE(p.text, '')),
              plainto_tsquery('english', $1)
            ), 0) * 0.4 +
            -- Partial match score (0-1 scale)
            CASE 
              WHEN LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $1 || '%') THEN 0.3
              ELSE 0
            END +
            -- Fuzzy match score (0-1 scale, using similarity)
            COALESCE(similarity(LOWER(COALESCE(p.text, '')), LOWER($1)), 0) * 0.3
          ) as text_relevance,
          -- Remix score (always 0 since remix_count was removed)
          0 as remix_score
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE 
          -- Full-text search match
          to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', $1)
          OR
          -- Partial match (case-insensitive)
          LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $1 || '%')
          OR
          -- Fuzzy match (similarity threshold of 0.3)
          similarity(LOWER(COALESCE(p.text, '')), LOWER($1)) > 0.3
      )
      SELECT *
      FROM search_results
      ORDER BY 
        -- Combined score: 40% text relevance + 60% remix score
        -- Videos with more remixes are weighted higher as they're more popular/trending
        (text_relevance * 0.4 + remix_score * 0.6) DESC,
        posted_at DESC
      LIMIT $2
    `;

    // Format query parameter based on search type
    const queryParam = fast ? `%${query}%` : query;
    
    // Time the query for performance monitoring
    const queryStart = Date.now();
    const result = await client.query(searchQuery, [queryParam, limit]);
    const queryTime = Date.now() - queryStart;
    
    console.log(`⚡ ${fast ? 'Fast' : 'Full'} search completed in ${queryTime}ms`);
    if (queryTime > 1000) {
      console.warn(`🐌 Slow query detected: ${queryTime}ms for "${query}"`);
    }
    
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

    console.log(`✅ Found ${items.length} results for query: "${query}" (fast=${fast})`);
    if (result.rows.length > 0 && !fast) {
      console.log(`📊 Top result: text_relevance=${result.rows[0].text_relevance?.toFixed(3)}, remix_score=${result.rows[0].remix_score?.toFixed(3)}`);
    }

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

