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

    // Get database size and storage metrics
    const dbSizeResult = await query(`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        pg_database_size(current_database()) as database_size_bytes
    `);

    // Get table size metrics
    const tableSizeResult = await query(`
      SELECT 
        t.schemaname,
        t.tablename,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))) as size,
        pg_total_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename)) as size_bytes,
        pg_size_pretty(pg_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))) as table_size,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename)) - pg_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))) as index_size
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      ORDER BY pg_total_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename)) DESC
    `);

    // Get database performance metrics
    const performanceResult = await query(`
      SELECT 
        numbackends as active_connections,
        xact_commit as transactions_committed,
        xact_rollback as transactions_rolled_back,
        blks_read as disk_blocks_read,
        blks_hit as buffer_hits,
        tup_returned as tuples_returned,
        tup_fetched as tuples_fetched,
        tup_inserted as tuples_inserted,
        tup_updated as tuples_updated,
        tup_deleted as tuples_deleted,
        ROUND(((blks_hit::float / NULLIF(blks_hit + blks_read, 0)) * 100)::numeric, 2) as cache_hit_ratio
      FROM pg_stat_database 
      WHERE datname = current_database()
    `);

    // Get index usage statistics
    const indexStatsResult = await query(`
      SELECT 
        i.schemaname,
        i.relname as tablename,
        i.indexrelname as indexname,
        i.idx_tup_read as index_tuples_read,
        i.idx_tup_fetch as index_tuples_fetched
      FROM pg_stat_user_indexes i
      WHERE i.schemaname = 'public'
      ORDER BY i.idx_tup_read DESC
      LIMIT 10
    `);

    // Get memory and connection info
    const memoryResult = await query(`
      SELECT 
        setting as max_connections,
        (SELECT setting FROM pg_settings WHERE name = 'shared_buffers') as shared_buffers,
        (SELECT setting FROM pg_settings WHERE name = 'effective_cache_size') as effective_cache_size,
        (SELECT setting FROM pg_settings WHERE name = 'work_mem') as work_mem
      FROM pg_settings 
      WHERE name = 'max_connections'
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
        dailyStats: dailyStatsResult.rows,
        storage: {
          databaseSize: dbSizeResult.rows[0]?.database_size || 'Unknown',
          databaseSizeBytes: dbSizeResult.rows[0]?.database_size_bytes || 0,
          tables: tableSizeResult.rows || []
        },
        performance: performanceResult.rows[0] || {},
        indexes: indexStatsResult.rows || [],
        memory: memoryResult.rows[0] || {}
      }
    });
  } catch (error: unknown) {
    console.error('API error:', error);
    
    // If it's a PostgreSQL module error, return a helpful message
    if (error instanceof Error && error.message?.includes('PostgreSQL module not available')) {
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
      { error: 'Failed to fetch scanner stats', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

