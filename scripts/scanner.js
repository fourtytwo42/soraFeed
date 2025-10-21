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

// Adaptive throttling configuration
let currentFetchLimit = 200; // Start with 200 (minimum)
const MIN_FETCH_LIMIT = 200;
const MAX_FETCH_LIMIT = 1000; // Reasonable upper bound

// Scan lock to prevent overlapping scans
let isScanning = false;
const MAX_SCAN_DURATION = 300000; // 5 minutes maximum scan duration

// Rate limiting
let consecutiveErrors = 0;
let scanInterval = 10000; // Start with 10 seconds

// Cookie management
let lastCookieRefresh = Date.now();
const COOKIE_REFRESH_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours

// Track previous scan count for change calculation
let previousScanCount = 0;

// Adaptive throttling logic
function adjustFetchLimit(duplicates) {
  const previousLimit = currentFetchLimit;
  
  if (duplicates < 50) {
    // Low duplicates = increase fetch size for efficiency
    currentFetchLimit = Math.min(currentFetchLimit + 50, MAX_FETCH_LIMIT);
  } else if (duplicates > 100) {
    // High duplicates = decrease fetch size to reduce waste
    currentFetchLimit = Math.max(currentFetchLimit - 20, MIN_FETCH_LIMIT);
  }
  // If duplicates are between 50-100, keep current limit (optimal range)
  
  if (currentFetchLimit !== previousLimit) {
    console.log(`🎯 Adaptive throttling: ${duplicates} duplicates → limit ${previousLimit} → ${currentFetchLimit}`);
  }
  
  return currentFetchLimit;
}

// Check if cookies need refresh
function shouldRefreshCookies() {
  return Date.now() - lastCookieRefresh > COOKIE_REFRESH_INTERVAL;
}

// Refresh cookies using the refresh script
async function refreshCookies() {
  try {
    console.log('🔄 Refreshing cookies...');
    const { refreshCookies: refreshFn } = require('./refresh-cookies.js');
    await refreshFn();
    lastCookieRefresh = Date.now();
    console.log('✅ Cookies refreshed successfully');
    return true;
  } catch (error) {
    console.error('❌ Cookie refresh failed:', error.message);
    return false;
  }
}

// Fetch feed from Sora API with dynamic limit
async function fetchSoraFeed(limit = currentFetchLimit) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sora.chatgpt.com',
      path: `/backend/project_y/feed?limit=${limit}&cut=nf2_latest`,
      method: 'GET',
      timeout: 30000, // 30 second timeout
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'User-Agent': process.env.USER_AGENT || 'SoraFeedScanner/1.0',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
        'Cookie': [
          `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
          `cf_clearance=${process.env.CF_CLEARANCE}`,
          `__cf_bm=${process.env.CF_BM}`,
          `oai-sc=${process.env.OAI_SC}`,
          `oai-did=${process.env.OAI_DID}`
        ].filter(Boolean).join('; ')
      }
    };

    const req = https.get(options, (res) => {
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
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout after 30 seconds'));
    });

    // Set a manual timeout as backup
    const timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error('Request timeout after 30 seconds'));
    }, 30000);

    req.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

// Fetch feed with minimum guarantee of 200 posts
async function fetchSoraFeedWithMinimum(limit = currentFetchLimit) {
  const minPosts = 200;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    const feedData = await fetchSoraFeed(limit);
    const postCount = feedData.items?.length || 0;
    
    if (postCount >= minPosts) {
      return feedData;
    }
    
    attempts++;
    console.log(`⚠️  Only got ${postCount} posts (need ${minPosts}), attempt ${attempts}/${maxAttempts}`);
    
    if (attempts < maxAttempts) {
      // Increase limit for next attempt
      limit = Math.max(limit + 50, minPosts);
      console.log(`🔄 Retrying with limit ${limit}...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
  }
  
  // If we still don't have enough posts after all attempts, return what we have
  console.log(`⚠️  Could not get minimum ${minPosts} posts after ${maxAttempts} attempts`);
  return await fetchSoraFeed(limit);
}

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔧 Initializing database...');

    // Enable pg_trgm extension for fuzzy matching
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('✅ pg_trgm extension enabled');
    } catch (error) {
      console.log('⚠️ pg_trgm extension check:', error);
    }

    // Create creators table
    await client.query(`
      CREATE TABLE IF NOT EXISTS creators (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        profile_picture_url TEXT,
        permalink TEXT,
        follower_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        post_count INTEGER DEFAULT 0,
        verified BOOLEAN DEFAULT false,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username)
      );
    `);

    // Create posts table (normalized schema)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sora_posts (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL REFERENCES creators(id),
        text TEXT,
        posted_at BIGINT NOT NULL,
        updated_at BIGINT,
        permalink TEXT NOT NULL,
        
        -- Video metadata
        video_url TEXT,
        video_url_md TEXT,
        thumbnail_url TEXT,
        gif_url TEXT,
        width INTEGER,
        height INTEGER,
        generation_id TEXT,
        task_id TEXT,
        
        -- Engagement metrics
        like_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        remix_count INTEGER DEFAULT 0,
        
        -- Tracking
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for creators
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_creators_username ON creators(username);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_creators_verified ON creators(verified) WHERE verified = true;
    `);

    // Create indexes for posts
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_creator_id ON sora_posts(creator_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON sora_posts(posted_at DESC);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_indexed_at ON sora_posts(indexed_at DESC);
    `);

    // Full-text search index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_text_fts ON sora_posts USING gin(to_tsvector('english', COALESCE(text, '')));
    `);

    // Trigram index for fuzzy matching
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_posts_text_trgm 
        ON sora_posts USING gin(text gin_trgm_ops)
      `);
      console.log('✅ Trigram index created');
    } catch (error) {
      console.log('⚠️ Trigram index check:', error);
    }

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
        error_message TEXT,
        last_scan_count INTEGER DEFAULT 0,
        previous_scan_count INTEGER DEFAULT 0,
        last_scan_duplicates INTEGER DEFAULT 0,
        last_scan_unique INTEGER DEFAULT 0
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

      // Extract video metadata from attachments
      const attachment = post.attachments?.[0] || {};
      const encodings = attachment.encodings || {};
      
      // Insert or update creator
      await client.query(`
        INSERT INTO creators (
          id, username, display_name, profile_picture_url,
          permalink, follower_count, following_count,
          post_count, verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          follower_count = EXCLUDED.follower_count,
          following_count = EXCLUDED.following_count,
          post_count = EXCLUDED.post_count,
          last_updated = CURRENT_TIMESTAMP
      `, [
        profile.user_id || profile.id,
        profile.username || '',
        profile.display_name || null,
        profile.profile_picture_url || null,
        profile.permalink || null,
        profile.follower_count || 0,
        profile.following_count || 0,
        profile.post_count || 0,
        profile.verified || false
      ]);
      
      // Insert new post into normalized schema
      await client.query(`
        INSERT INTO sora_posts (
          id, creator_id, text, posted_at, permalink,
          video_url, video_url_md, thumbnail_url, gif_url,
          width, height, generation_id, task_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
      `, [
        post.id,
        profile.user_id || profile.id,
        post.text || null,
        Math.floor(post.posted_at || 0),
        post.permalink || null,
        encodings.source?.path || null,
        encodings.md?.path || null,
        encodings.thumbnail?.path || null,
        encodings.gif?.path || null,
        attachment.width || null,
        attachment.height || null,
        attachment.generation_id || null,
        attachment.task_id || null
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
async function updateStats(stats, duration, error = null, scanCount = 0, scanDuplicates = 0, scanUnique = 0) {
  try {
    // First, get the current last_scan_count to store as previous
    const currentStats = await pool.query('SELECT last_scan_count FROM scanner_stats WHERE id = 1');
    const previousScanCount = currentStats.rows[0]?.last_scan_count || 0;
    
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
        error_message = $7,
        previous_scan_count = $8,
        last_scan_count = $9,
        last_scan_duplicates = $10,
        last_scan_unique = $11
      WHERE id = 1
    `, [
      stats.total || 0,
      stats.newPosts || 0,
      stats.duplicates || 0,
      error ? 1 : 0,
      duration,
      error ? 'error' : 'success',
      error ? error.message : null,
      previousScanCount,
      scanCount,
      scanDuplicates,
      scanUnique
    ]);
  } catch (err) {
    console.error('Failed to update stats:', err);
  }
}

// Main scan function
async function scanFeed() {
  // Check if already scanning to prevent overlaps
  if (isScanning) {
    console.log(`⏸️  [${new Date().toISOString()}] Scan already in progress, skipping... (current limit: ${currentFetchLimit})`);
    return;
  }

  // Set scan lock
  isScanning = true;
  const startTime = Date.now();
  console.log(`\n🔍 [${new Date().toISOString()}] Starting scan (limit: ${currentFetchLimit})...`);

  // Set timeout to prevent stuck locks
  const scanTimeout = setTimeout(() => {
    if (isScanning) {
      console.error(`⏰ [${new Date().toISOString()}] Scan timeout after ${MAX_SCAN_DURATION}ms, releasing lock`);
      isScanning = false;
    }
  }, MAX_SCAN_DURATION);

  try {
    // Check if cookies need refresh
    if (shouldRefreshCookies()) {
      console.log('🍪 Cookies are stale, refreshing...');
      await refreshCookies();
    }

    // Update status to scanning
    await pool.query(`UPDATE scanner_stats SET status = 'scanning' WHERE id = 1`);

    // Fetch feed with current limit (guaranteed minimum 200 posts)
    const feedData = await fetchSoraFeedWithMinimum(currentFetchLimit);
    console.log(`📥 Fetched ${feedData.items?.length || 0} posts from API`);

    // Process posts
    const result = await processPosts(feedData);
    const duration = Date.now() - startTime;
    const currentScanCount = feedData.items?.length || 0;
    
    // Calculate change from previous scan
    let changeText = '';
    if (previousScanCount > 0) {
      const change = currentScanCount - previousScanCount;
      if (change > 0) {
        changeText = ` (+${change})`;
      } else if (change < 0) {
        changeText = ` (${change})`;
      } else {
        changeText = ' (=)';
      }
    }
    
    // Update previous scan count for next comparison
    previousScanCount = currentScanCount;

    console.log(`✅ Scan complete:`);
    console.log(`   - Posts scanned: ${currentScanCount}${changeText}`);
    console.log(`   - New posts: ${result.newPosts}`);
    console.log(`   - Duplicates: ${result.duplicates}`);
    console.log(`   - Total: ${result.total}`);
    console.log(`   - Duration: ${duration}ms`);

    // Apply adaptive throttling based on duplicate count
    const newLimit = adjustFetchLimit(result.duplicates);
    
    // Update statistics
    await updateStats({
      total: result.total,
      newPosts: result.newPosts,
      duplicates: result.duplicates
    }, duration, null, currentScanCount, result.duplicates, result.newPosts);

    // Reset consecutive errors on successful scan
    if (consecutiveErrors > 0) {
      console.log(`✅ Scan successful, resetting error counter (was ${consecutiveErrors})`);
      consecutiveErrors = 0;
      scanInterval = 10000; // Reset to 10 seconds
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Scan error:`, error.message);
    await updateStats({}, duration, error, 0, 0, 0);
    
    // Check if error is cookie-related or timeout-related
    const isCookieError = error.message.includes('JSON parse error') || 
                         error.message.includes('<!DOCTYPE') ||
                         error.message.includes('cloudflare') ||
                         error.message.includes('timeout') ||
                         error.message.includes('upstream');
    
    if (isCookieError && consecutiveErrors >= 2) {
      console.log('🍪 Detected cookie/timeout error, attempting refresh...');
      const refreshSuccess = await refreshCookies();
      if (refreshSuccess) {
        consecutiveErrors = 0; // Reset on successful refresh
        currentFetchLimit = 200; // Reset to minimum limit
        scanInterval = 10000; // Reset to minimum interval
        console.log('✅ Cookie refresh successful, resetting error counter and limits');
      }
    }
    
    // If we have too many consecutive errors, reset everything
    if (consecutiveErrors >= 10) {
      console.log('🔄 Too many consecutive errors, resetting scanner state...');
      currentFetchLimit = 200; // Reset to minimum
      scanInterval = 30000; // Increase interval to 30 seconds
      consecutiveErrors = 0; // Reset error counter
      console.log('🔄 Scanner state reset - limit: 200, interval: 30s');
    }
    
    // Increment consecutive errors and adjust rate limiting
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      scanInterval = Math.min(scanInterval * 2, 120000); // Max 2 minutes
      console.log(`🐌 Rate limiting: ${consecutiveErrors} consecutive errors, increasing interval to ${scanInterval/1000}s`);
    }
  } finally {
    // Clear timeout and release the scan lock
    clearTimeout(scanTimeout);
    isScanning = false;
    console.log(`🔓 [${new Date().toISOString()}] Scan lock released`);
  }
}

// Schedule next scan with dynamic interval
function scheduleNextScan() {
  setTimeout(() => {
    scanFeed().then(() => {
      scheduleNextScan(); // Schedule the next scan
    }).catch((error) => {
      console.error('❌ Scan failed:', error);
      scheduleNextScan(); // Still schedule next scan even on error
    });
  }, scanInterval);
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

    // Schedule scans with dynamic interval
    console.log(`⏰ Scheduling scans every ${scanInterval/1000} seconds...`);
    scheduleNextScan();

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

