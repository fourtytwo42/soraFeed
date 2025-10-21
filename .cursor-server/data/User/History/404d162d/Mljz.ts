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

    // Advanced search query with multiple matching strategies:
    // 1. Full-text search (ts_rank for relevance)
    // 2. Partial match (ILIKE for case-insensitive substring)
    // 3. Fuzzy match (similarity for typo tolerance)
    // Results are weighted by: text relevance + remix count
    const searchQuery = `
      WITH search_results AS (
        SELECT 
          post_data,
          profile_data,
          text,
          posted_at,
          updated_at,
          like_count,
          view_count,
          remix_count,
          permalink,
          -- Calculate combined relevance score
          (
            -- Full-text search relevance (0-1 scale)
            COALESCE(ts_rank_cd(
              to_tsvector('english', COALESCE(text, '')),
              plainto_tsquery('english', $1)
            ), 0) * 0.4 +
            -- Partial match score (0-1 scale)
            CASE 
              WHEN LOWER(COALESCE(text, '')) LIKE LOWER('%' || $1 || '%') THEN 0.3
              ELSE 0
            END +
            -- Fuzzy match score (0-1 scale, using similarity)
            COALESCE(similarity(LOWER(COALESCE(text, '')), LOWER($1)), 0) * 0.3
          ) as text_relevance,
          -- Normalize remix count (0-1 scale, using log for better distribution)
          CASE 
            WHEN remix_count > 0 THEN LEAST(LOG(remix_count + 1) / 10, 1)
            ELSE 0
          END as remix_score
        FROM sora_posts
        WHERE 
          -- Full-text search match
          to_tsvector('english', COALESCE(text, '')) @@ plainto_tsquery('english', $1)
          OR
          -- Partial match (case-insensitive)
          LOWER(COALESCE(text, '')) LIKE LOWER('%' || $1 || '%')
          OR
          -- Fuzzy match (similarity threshold of 0.3)
          similarity(LOWER(COALESCE(text, '')), LOWER($1)) > 0.3
      )
      SELECT 
        post_data,
        profile_data,
        text,
        posted_at,
        updated_at,
        like_count,
        view_count,
        remix_count,
        permalink,
        text_relevance,
        remix_score
      FROM search_results
      ORDER BY 
        -- Combined score: 60% text relevance + 40% remix score
        (text_relevance * 0.6 + remix_score * 0.4) DESC,
        posted_at DESC
      LIMIT $2
    `;

    const result = await client.query(searchQuery, [query, limit]);
    
    // Transform database results to SoraFeedItem format
    const items: SoraFeedItem[] = result.rows.map((row: any) => ({
      post: row.post_data,
      profile: row.profile_data,
    }));

    console.log(`✅ Found ${items.length} results for query: "${query}"`);
    if (result.rows.length > 0) {
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

