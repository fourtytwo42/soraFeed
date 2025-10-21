const { Pool } = require('pg');
const https = require('https');
require('dotenv').config();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Fetch feed from Sora API
function fetchSoraFeed() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sora.chatgpt.com',
      path: '/backend/project_y/feed?limit=200&cut=nf2_latest',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'User-Agent': process.env.USER_AGENT || 'SoraFeedScanner/1.0',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9'
      }
    };

    https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔧 Initializing database...');

    // Create posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sora_posts (
        id TEXT PRIMARY KEY,
        post_data JSONB NOT NULL,
        profile_data JSONB NOT NULL,
        text TEXT,
        posted_at BIGINT,
        updated_at BIGINT,
        like_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        remix_count INTEGER DEFAULT 0,
        permalink TEXT,
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id)
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_posted_at ON sora_posts(posted_at DESC);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_indexed_at ON sora_posts(indexed_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_text ON sora_posts USING gin(to_tsvector('english', COALESCE(text, '')));
    `);

    // Create scanner_stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scanner_stats (
        id SERIAL PRIMARY KEY,
        total_scanned INTEGER DEFAULT 0,
        new_posts INTEGER DEFAULT 0,
        duplicate_posts INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        last_scan_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scan_duration_ms INTEGER DEFAULT 0,
        status TEXT DEFAULT 'idle',
        error_message TEXT
      );
    `);

    // Initialize scanner_stats if empty
    const statsCheck = await client.query('SELECT COUNT(*) FROM scanner_stats');
    if (parseInt(statsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO scanner_stats (total_scanned, new_posts, duplicate_posts, errors, status)
        VALUES (0, 0, 0, 0, 'idle')
      `);
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Process and store posts
async function processPosts(feedData) {
  const client = await pool.connect();
  let newPosts = 0;
  let duplicates = 0;
  
  try {
    await client.query('BEGIN');

    if (!feedData.items || !Array.isArray(feedData.items)) {
      throw new Error('Invalid feed data structure');
    }

    for (const item of feedData.items) {
      const { post, profile } = item;
      
      // Check if post already exists
      const existCheck = await client.query(
        'SELECT id FROM sora_posts WHERE id = $1',
        [post.id]
      );

      if (existCheck.rows.length > 0) {
        duplicates++;
        continue;
      }

      // Insert new post
      await client.query(`
        INSERT INTO sora_posts (
          id, post_data, profile_data, text, posted_at, updated_at,
          like_count, view_count, remix_count, permalink
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `, [
        post.id,
        JSON.stringify(post),
        JSON.stringify(profile),
        post.text || null,
        post.posted_at || 0,
        post.updated_at || 0,
        0, // like_count - not in API response
        0, // view_count - not in API response
        0, // remix_count - not in API response
        post.permalink || null
      ]);

      newPosts++;
    }

    await client.query('COMMIT');
    return { newPosts, duplicates, total: feedData.items.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Update scanner statistics
async function updateStats(stats, duration, error = null) {
  try {
    await pool.query(`
      UPDATE scanner_stats
      SET 
        total_scanned = total_scanned + $1,
        new_posts = new_posts + $2,
        duplicate_posts = duplicate_posts + $3,
        errors = errors + $4,
        last_scan_at = CURRENT_TIMESTAMP,
        scan_duration_ms = $5,
        status = $6,
        error_message = $7
      WHERE id = 1
    `, [
      stats.total || 0,
      stats.newPosts || 0,
      stats.duplicates || 0,
      error ? 1 : 0,
      duration,
      error ? 'error' : 'success',
      error ? error.message : null
    ]);
  } catch (err) {
    console.error('Failed to update stats:', err);
  }
}

// Main scan function
async function scanFeed() {
  const startTime = Date.now();
  console.log(`\n🔍 [${new Date().toISOString()}] Starting scan...`);

  try {
    // Update status to scanning
    await pool.query(`UPDATE scanner_stats SET status = 'scanning' WHERE id = 1`);

    // Fetch feed
    const feedData = await fetchSoraFeed();
    console.log(`📥 Fetched ${feedData.items?.length || 0} posts from API`);

    // Process posts
    const result = await processPosts(feedData);
    const duration = Date.now() - startTime;

    console.log(`✅ Scan complete:`);
    console.log(`   - New posts: ${result.newPosts}`);
    console.log(`   - Duplicates: ${result.duplicates}`);
    console.log(`   - Total: ${result.total}`);
    console.log(`   - Duration: ${duration}ms`);

    // Update statistics
    await updateStats({
      total: result.total,
      newPosts: result.newPosts,
      duplicates: result.duplicates
    }, duration);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Scan error:`, error.message);
    await updateStats({}, duration, error);
  }
}

// Main function
async function main() {
  try {
    console.log('🚀 Sora Feed Scanner Starting...');
    console.log('📊 Database:', process.env.DB_NAME || 'sora_feed');
    
    // Initialize database
    await initDatabase();

    // Run initial scan
    await scanFeed();

    // Schedule scans every 10 seconds
    console.log('⏰ Scheduling scans every 10 seconds...');
    setInterval(scanFeed, 10000);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down scanner...');
  await pool.query(`UPDATE scanner_stats SET status = 'stopped' WHERE id = 1`);
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down scanner...');
  await pool.query(`UPDATE scanner_stats SET status = 'stopped' WHERE id = 1`);
  await pool.end();
  process.exit(0);
});

// Start the scanner
main();

