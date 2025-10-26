const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.50.104',
  port: 5432,
  database: 'sora_feed',
  user: 'postgres',
  password: 'postgres'
});

async function benchmark() {
  try {
    console.log('⚡ Benchmarking Query Performance\n');
    
    // Warm up
    await pool.query('SELECT 1');
    
    // Test the main query pattern used by QueueManager
    const tests = 5;
    const times = [];
    
    for (let i = 0; i < tests; i++) {
      const start = Date.now();
      await pool.query(`
        SELECT id, creator_id, text, video_url
        FROM sora_posts 
        WHERE text ILIKE '%commercial%'
        ORDER BY posted_at DESC
        LIMIT 100
      `);
      times.push(Date.now() - start);
    }
    
    const avg = Math.round(times.reduce((a,b) => a+b) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    console.log(`Results after ${tests} runs:`);
    console.log(`  Average: ${avg}ms`);
    console.log(`  Min: ${min}ms`);
    console.log(`  Max: ${max}ms`);
    console.log(`  Times: ${times.join('ms, ')}ms`);
    
    console.log(`\n✅ Query is running at ~${avg}ms average`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

benchmark();
