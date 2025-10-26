const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.50.104',
  port: 5432,
  database: 'sora_feed',
  user: 'postgres',
  password: 'postgres'
});

async function testQueries() {
  try {
    console.log('🧪 Testing Query Performance\n');
    
    const tests = [];
    
    // Test 1: Basic ILIKE search (like QueueManager does)
    const start1 = Date.now();
    const result1 = await pool.query(`
      SELECT id, text, video_url 
      FROM sora_posts 
      WHERE text ILIKE '%commercial%'
      ORDER BY posted_at DESC
      LIMIT 100
    `);
    const duration1 = Date.now() - start1;
    tests.push({ name: 'ILIKE search (commercial)', duration: duration1, rows: result1.rows.length });
    
    // Test 2: Random selection (like populateTimelineVideos)
    const start2 = Date.now();
    const result2 = await pool.query(`
      SELECT * FROM sora_posts
      WHERE text ILIKE '%music video%'
      ORDER BY RANDOM()
      LIMIT 10
    `);
    const duration2 = Date.now() - start2;
    tests.push({ name: 'Random selection (music video)', duration: duration2, rows: result2.rows.length });
    
    // Test 3: Recent posts
    const start3 = Date.now();
    const result3 = await pool.query(`
      SELECT * FROM sora_posts
      ORDER BY indexed_at DESC
      LIMIT 50
    `);
    const duration3 = Date.now() - start3;
    tests.push({ name: 'Recent posts (sorted)', duration: duration3, rows: result3.rows.length });
    
    // Test 4: Count query
    const start4 = Date.now();
    const result4 = await pool.query(`
      SELECT COUNT(*) as count
      FROM sora_posts
      WHERE text ILIKE '%trailer%'
    `);
    const duration4 = Date.now() - start4;
    tests.push({ name: 'Count query (trailer)', duration: duration4, rows: result4.rows[0].count });
    
    // Test 5: Multiple term search
    const start5 = Date.now();
    const result5 = await pool.query(`
      SELECT * FROM sora_posts
      WHERE text ILIKE '%cinematic%' 
        AND text ILIKE '%movie%'
      LIMIT 50
    `);
    const duration5 = Date.now() - start5;
    tests.push({ name: 'Multiple term search', duration: duration5, rows: result5.rows.length });
    
    // Test 6: Creator filter
    const start6 = Date.now();
    const result6 = await pool.query(`
      SELECT * FROM sora_posts
      WHERE creator_id IN (
        SELECT id FROM creators LIMIT 10
      )
      ORDER BY posted_at DESC
      LIMIT 100
    `);
    const duration6 = Date.now() - start6;
    tests.push({ name: 'Creator filter', duration: duration6, rows: result6.rows.length });
    
    // Print results
    console.log('=== Query Performance Results ===\n');
    let total = 0;
    tests.forEach((test, i) => {
      const status = test.duration < 100 ? '✅' : test.duration < 500 ? '🟡' : '🔴';
      console.log(`${status} Test ${i + 1}: ${test.name}`);
      console.log(`   Duration: ${test.duration}ms | Rows: ${test.rows}`);
      total += test.duration;
    });
    
    console.log(`\n📊 Average: ${Math.round(total / tests.length)}ms`);
    console.log(`📊 Total: ${total}ms\n`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

testQueries();
