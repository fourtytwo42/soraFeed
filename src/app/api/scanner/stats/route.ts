import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // Get scanner statistics
    const statsResult = await query('SELECT * FROM scanner_stats ORDER BY id DESC LIMIT 1');
    const stats = statsResult.rows[0] || {
      total_scanned: 0,
      new_posts: 0,
      duplicate_posts: 0,
      errors: 0,
      last_scan_at: null,
      scan_duration_ms: 0,
      status: 'unknown',
      error_message: null
    };

    // Get total posts count
    const countResult = await query('SELECT COUNT(*) as total FROM sora_posts');
    const totalPosts = parseInt(countResult.rows[0].total);

    // Get recent posts (last 10)
    const recentResult = await query(`
      SELECT id, text, posted_at, indexed_at, permalink
      FROM sora_posts
      ORDER BY indexed_at DESC
      LIMIT 10
    `);

    // Get posts per day stats (last 7 days)
    const dailyStatsResult = await query(`
      SELECT 
        DATE(indexed_at) as date,
        COUNT(*) as count
      FROM sora_posts
      WHERE indexed_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      GROUP BY DATE(indexed_at)
      ORDER BY date DESC
    `);

    return NextResponse.json({
      scanner: {
        status: stats.status,
        totalScanned: stats.total_scanned,
        newPosts: stats.new_posts,
        duplicatePosts: stats.duplicate_posts,
        errors: stats.errors,
        lastScanAt: stats.last_scan_at,
        scanDurationMs: stats.scan_duration_ms,
        errorMessage: stats.error_message
      },
      database: {
        totalPosts,
        recentPosts: recentResult.rows,
        dailyStats: dailyStatsResult.rows
      }
    });
  } catch (error: any) {
    console.error('API error:', error);
    
    // If it's a PostgreSQL module error, return a helpful message
    if (error.message?.includes('PostgreSQL module not available')) {
      return NextResponse.json({
        error: 'Database not configured',
        details: 'PostgreSQL dependencies not installed. Run: npm install pg @types/pg',
        scanner: {
          status: 'not_configured',
          totalScanned: 0,
          newPosts: 0,
          duplicatePosts: 0,
          errors: 0,
          lastScanAt: null,
          scanDurationMs: 0,
          errorMessage: 'PostgreSQL module not available'
        },
        database: {
          totalPosts: 0,
          recentPosts: [],
          dailyStats: []
        }
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch scanner stats', details: error.message },
      { status: 500 }
    );
  }
}

