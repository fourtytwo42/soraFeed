const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.50.104',
  port: 5432,
  database: 'sora_feed',
  user: 'postgres',
  password: 'postgres'
});

async function analyze() {
  try {
    console.log('=== Index Usage Statistics ===');
    const indexUsage = await pool.query(`
      SELECT 
        indexrelname as index_name,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND relname = 'sora_posts'
      ORDER BY idx_scan DESC
    `);
    console.table(indexUsage.rows);
    
    console.log('\n=== Table Scan Statistics ===');
    const tableStats = await pool.query(`
      SELECT 
        seq_scan as sequential_scans,
        idx_scan as index_scans,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        ROUND(100.0 * seq_scan / NULLIF(seq_scan + idx_scan, 0), 2) as seq_scan_pct
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname = 'sora_posts'
    `);
    console.table(tableStats.rows);
    
    console.log('\n=== Column Information ===');
    const columns = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sora_posts'
      ORDER BY ordinal_position
    `);
    console.table(columns.rows);
    
    // Test various query patterns
    console.log('\n=== Testing Query Patterns ===');
    
    // Test timestamp sort
    const start1 = Date.now();
    await pool.query('SELECT * FROM sora_posts ORDER BY posted_at DESC LIMIT 100');
    console.log(`Sort by posted_at: ${Date.now() - start1}ms`);
    
    // Test text search
    const start2 = Date.now();
    await pool.query(`SELECT * FROM sora_posts WHERE text ILIKE '%commercial%' LIMIT 100`);
    console.log(`ILIKE search: ${Date.now() - start2}ms`);
    
    // Test date range
    const start3 = Date.now();
    await pool.query(`SELECT * FROM sora_posts WHERE posted_at > NOW() - INTERVAL '7 days' LIMIT 100`);
    console.log(`Date range filter: ${Date.now() - start3}ms`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

analyze();
