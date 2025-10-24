import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('term');
    const format = searchParams.get('format') || 'mixed'; // 'mixed', 'wide', 'tall'

    if (!searchTerm || searchTerm.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search term is required' },
        { status: 400 }
      );
    }

    const client = await getClient();
    
    // Build format filtering conditions
    let formatClause = '';
    if (format === 'wide') {
      formatClause = ' AND p.width > p.height';
    } else if (format === 'tall') {
      formatClause = ' AND p.height > p.width';
    }
    // 'mixed' means no additional filtering

    // Parse search query to separate include and exclude terms
    const parseSearchQuery = (searchQuery: string) => {
      const words = searchQuery.trim().split(/\s+/);
      const includeTerms: string[] = [];
      const excludeTerms: string[] = [];
      
      for (const word of words) {
        if (word.startsWith('-') && word.length > 1) {
          excludeTerms.push(word.substring(1));
        } else if (word.length > 0) {
          includeTerms.push(word);
        }
      }
      
      return { includeTerms, excludeTerms };
    };

    const { includeTerms, excludeTerms } = parseSearchQuery(searchTerm);
    const includeQuery = includeTerms.join(' ');
    
    if (includeTerms.length === 0) {
      return NextResponse.json({
        searchTerm,
        format,
        totalCount: 0,
        availableCount: 0
      });
    }

    // Build exclude conditions
    let excludeConditions = '';
    if (excludeTerms.length > 0) {
      excludeConditions = excludeTerms.map((term, index) => 
        `AND LOWER(COALESCE(p.text, '')) NOT LIKE LOWER('%${term}%')`
      ).join(' ');
    }

    // Count total matching videos
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM sora_posts p
      JOIN creators c ON p.creator_id = c.id
      WHERE (
        -- Full-text search match
        to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', $1)
        OR
        -- Exact phrase match
        LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $1 || '%')
        OR
        -- Word boundary match for single words
        (LOWER(COALESCE(p.text, '')) ~ LOWER('\\m' || $1 || '\\M') 
         AND LENGTH($1) - LENGTH(REPLACE($1, ' ', '')) = 0)
      )
      ${formatClause}
      ${excludeConditions}
    `;

    const countResult = await client.query(countQuery, [includeQuery]);
    const totalCount = parseInt(countResult.rows[0].total_count);

    // Count available videos (not yet played by any display)
    const availableQuery = `
      SELECT COUNT(*) as available_count
      FROM sora_posts p
      JOIN creators c ON p.creator_id = c.id
      WHERE (
        -- Full-text search match
        to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', $1)
        OR
        -- Exact phrase match
        LOWER(COALESCE(p.text, '')) LIKE LOWER('%' || $1 || '%')
        OR
        -- Word boundary match for single words
        (LOWER(COALESCE(p.text, '')) ~ LOWER('\\m' || $1 || '\\M') 
         AND LENGTH($1) - LENGTH(REPLACE($1, ' ', '')) = 0)
      )
      ${formatClause}
      ${excludeConditions}
      AND p.id NOT IN (
        SELECT DISTINCT video_id 
        FROM video_history 
        WHERE video_id IS NOT NULL
      )
    `;

    const availableResult = await client.query(availableQuery, [includeQuery]);
    const availableCount = parseInt(availableResult.rows[0].available_count);

    return NextResponse.json({
      searchTerm,
      format,
      totalCount,
      availableCount,
      seenCount: totalCount - availableCount
    });

  } catch (error) {
    console.error('Error counting search results:', error);
    return NextResponse.json(
      { error: 'Failed to count search results' },
      { status: 500 }
    );
  }
}
