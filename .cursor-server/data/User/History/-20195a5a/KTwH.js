const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function monitorThrottling() {
  const client = await pool.connect();
  
  try {
    console.log('🎯 Adaptive Throttling Monitor');
    console.log('==============================\n');
    
    // Get recent scanner stats to show throttling behavior
    const result = await client.query(`
      SELECT 
        id,
        new_posts,
        duplicate_posts,
        total_scanned,
        scan_duration_ms,
        last_scan_at,
        status
      FROM scanner_stats 
      ORDER BY id DESC 
      LIMIT 10
    `);
    
    console.log('Recent Scan Results (showing adaptive behavior):');
    console.log('Scan | New Posts | Duplicates | Total | Duration | Timestamp');
    console.log('-----|----------|------------|-------|----------|----------');
    
    result.rows.forEach((row, index) => {
      const scanNum = result.rows.length - index;
      const newPosts = row.new_posts || 0;
      const duplicates = row.duplicate_posts || 0;
      const total = row.total_scanned || 0;
      const duration = row.scan_duration_ms ? (row.scan_duration_ms / 1000).toFixed(1) : '0.0';
      const timestamp = row.last_scan_at ? new Date(row.last_scan_at).toLocaleTimeString() : 'N/A';
      
      // Predict what throttling would do based on duplicates
      let throttleAction = '';
      if (duplicates < 50) {
        throttleAction = '📈 +50';
      } else if (duplicates > 100) {
        throttleAction = '📉 -20';
      } else {
        throttleAction = '➡️  =';
      }
      
      console.log(`${scanNum.toString().padStart(4)} | ${newPosts.toString().padStart(8)} | ${duplicates.toString().padStart(10)} | ${total.toString().padStart(5)} | ${duration.padStart(6)}s | ${timestamp} ${throttleAction}`);
    });
    
    console.log('\nThrottling Logic:');
    console.log('📈 +50: Duplicates < 50  → Increase limit by 50 (more efficiency needed)');
    console.log('📉 -20: Duplicates > 100 → Decrease limit by 20 (too much waste)');
    console.log('➡️  =: Duplicates 50-100 → Keep current limit (optimal range)');
    console.log('🔒 Min limit: 200, Max limit: 1000');
    
  } catch (error) {
    console.error('❌ Monitor error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

monitorThrottling()
  .then(() => {
    console.log('\n✅ Monitoring complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Monitor failed:', error);
    process.exit(1);
  });
