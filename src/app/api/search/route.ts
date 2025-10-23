import { NextRequest, NextResponse } from 'next/server';
import { SoraFeedResponse, SoraFeedItem } from '@/types/sora';
import { getClient } from '@/lib/db';

export async function GET(request: NextRequest) {
  let client;
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '100');
    const fast = searchParams.get('fast') === 'true';
    const format = searchParams.get('format') || 'both'; // 'both', 'tall', 'wide'

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    // Parse search query to separate include and exclude terms
    const parseSearchQuery = (searchQuery: string) => {
      const words = searchQuery.trim().split(/\s+/);
      const includeTerms: string[] = [];
      const excludeTerms: string[] = [];
      
      for (const word of words) {
        if (word.startsWith('-') && word.length > 1) {
          // Remove the minus sign and add to exclude terms
          excludeTerms.push(word.substring(1));
        } else if (word.length > 0) {
          // Add to include terms (ignore empty strings)
          includeTerms.push(word);
        }
      }
      
      return { includeTerms, excludeTerms };
    };

    const { includeTerms, excludeTerms } = parseSearchQuery(query);
    const includeQuery = includeTerms.join(' ');
    
    console.log('🔍 Searching database for:', query);
    console.log('📝 Include terms:', includeTerms);
    console.log('🚫 Exclude terms:', excludeTerms);
    console.log('📐 Format filter:', format);

    // If no include terms, return empty results
    if (includeTerms.length === 0) {
      return NextResponse.json({
        items: [],
        cursor: null
      });
    }

    client = await getClient();
    console.log('🔗 Database client acquired successfully');
    
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

    // Build exclusion conditions for SQL
    const buildExclusionConditions = (excludeTerms: string[], isFast: boolean = false) => {
      if (excludeTerms.length === 0) return '';
      
      // For fast queries, we have an extra timestamp parameter, so start from index 4
      const startIndex = isFast ? 4 : 3;
      const conditions = excludeTerms.map((_, index) => 
        `NOT LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $${index + startIndex} || '%')`
      ).join(' AND ');
      
      return ` AND ${conditions}`;
    };

    const exclusionConditions = buildExclusionConditions(excludeTerms, false); // Both queries now use same parameter structure

    // Build format filtering conditions
    const buildFormatConditions = (format: string) => {
      if (format === 'wide') {
        return ' AND p.width > p.height';
      } else if (format === 'tall') {
        return ' AND p.height > p.width';
      }
      // 'both' means no additional filtering
      return '';
    };

    const formatConditions = buildFormatConditions(format);

    // Choose search strategy based on fast parameter
    const searchQuery = fast ? `
      -- Fast random search: simple random sample from matching posts
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
      WHERE (
        -- Exact phrase match for multi-word searches
        LOWER(COALESCE(p.text, '')) LIKE LOWER($1)
        OR
        -- Word boundary match for better precision
        LOWER(COALESCE(p.text, '')) ~ LOWER('\\m' || REPLACE($1, '%', '') || '\\M')
      )${exclusionConditions}${formatConditions}
      -- Pure random selection - like rolling dice on all matching videos
      ORDER BY RANDOM()
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
            -- Full-text search relevance (0-1 scale) - increased weight for exact matches
            COALESCE(ts_rank_cd(
              to_tsvector('english', COALESCE(p.text, '')),
              plainto_tsquery('english', $1)
            ), 0) * 0.3 +
            -- Multi-word phrase matches get highest priority
            CASE 
              WHEN LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $1 || '%') 
                   AND LENGTH($1) - LENGTH(REPLACE($1, ' ', '')) > 0 THEN 0.6
              ELSE 0
            END +
            -- Single word boundary matches get high priority  
            CASE 
              WHEN LOWER(COALESCE(p.text, '')) ~ LOWER('\\m' || $1 || '\\M') 
                   AND LENGTH($1) - LENGTH(REPLACE($1, ' ', '')) = 0 THEN 0.5
              ELSE 0
            END +
            -- Exact phrase match gets high score
            CASE 
              WHEN LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $1 || '%') THEN 0.15
              ELSE 0
            END +
            -- Fuzzy match score (0-1 scale, using similarity) - minimal weight
            COALESCE(similarity(LOWER(COALESCE(p.text, '')), LOWER($1)), 0) * 0.05
          ) as text_relevance,
          -- Use view count as popularity score (normalized)
          CASE 
            WHEN p.view_count > 0 THEN LEAST(LOG(p.view_count + 1) / 15, 1)
            ELSE 0
          END as popularity_score
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE 
          (
            -- Full-text search match (best for multi-word)
            to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', $1)
            OR
            -- Exact phrase match (case-insensitive)
            LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $1 || '%')
            OR
            -- Word boundary match for single words only
            (LOWER(COALESCE(p.text, '')) ~ LOWER('\\m' || $1 || '\\M') 
             AND LENGTH($1) - LENGTH(REPLACE($1, ' ', '')) = 0)
            OR
            -- Fuzzy match (similarity threshold of 0.3)
            similarity(LOWER(COALESCE(p.text, '')), LOWER($1)) > 0.3
          )${exclusionConditions}${formatConditions}
      )
      SELECT *
      FROM search_results
      ORDER BY 
        -- Combined score: 70% text relevance + 30% popularity score
        -- Prioritize relevance over popularity for better search results
        (text_relevance * 0.7 + popularity_score * 0.3) DESC,
        posted_at DESC
      LIMIT $2
    `;

    // Format query parameter based on search type
    const queryParam = fast ? `%${includeQuery}%` : includeQuery;
    
    // Build parameters array including exclude terms
    const queryParams = [queryParam, limit, ...excludeTerms];
    
    // Quick sanity check - count total posts in database
    if (fast) {
      const countResult = await client.query('SELECT COUNT(*) as total FROM sora_posts');
      const totalPosts = countResult.rows[0]?.total || 0;
      console.log(`📊 Database has ${totalPosts} total posts`);
      
      // Also check how many match our search (including exclusions)
      const matchCountQuery = `SELECT COUNT(*) as matches FROM sora_posts p WHERE (
        LOWER(COALESCE(p.text, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(p.text, '')) ~ LOWER('\\m' || REPLACE($1, '%', '') || '\\M')
      )${exclusionConditions}${formatConditions}`;
      const matchCountParams = queryParams.slice(0, 1 + excludeTerms.length);
      const matchCountResult = await client.query(matchCountQuery, matchCountParams);
      const matchCount = matchCountResult.rows[0]?.matches || 0;
      console.log(`🎯 Found ${matchCount} posts matching "${query}" (with exclusions)`);
    }

    // Time the query for performance monitoring
    const queryStart = Date.now();
    const result = await client.query(searchQuery, queryParams);
    const queryTime = Date.now() - queryStart;
    
    // Debug: Log some sample results to understand what's being returned
    if (result.rows.length > 0) {
      console.log(`🔍 Sample search results for "${query}":`);
      result.rows.slice(0, 3).forEach((row, index) => {
        console.log(`   ${index + 1}. "${row.text}" (ID: ${row.id})`);
      });
    }
    
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
  } finally {
    // Always release the database connection back to the pool
    if (client && typeof client.release === 'function') {
      try {
        client.release();
      } catch (releaseError) {
        console.error('Error releasing database connection:', releaseError);
      }
    }
  }
}

