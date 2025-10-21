const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
});

async function migrateToNormalizedSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Database Migration to Normalized Schema...');
    console.log('================================================\n');
    
    // Step 1: Create new normalized tables
    console.log('📋 Step 1: Creating new normalized tables...');
    
    await client.query('BEGIN');
    
    // Create creators table
    console.log('  - Creating creators table...');
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
    
    // Create new posts table
    console.log('  - Creating new posts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts_new (
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
    
    // Create metadata table for raw JSONB data (optional)
    console.log('  - Creating post_metadata table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS post_metadata (
        post_id TEXT PRIMARY KEY REFERENCES posts_new(id) ON DELETE CASCADE,
        raw_post_data JSONB,
        raw_attachments JSONB
      );
    `);
    
    await client.query('COMMIT');
    console.log('✅ New tables created successfully\n');
    
    // Step 2: Check if we have data to migrate
    console.log('📊 Step 2: Checking existing data...');
    const countResult = await client.query('SELECT COUNT(*) FROM sora_posts');
    const totalPosts = parseInt(countResult.rows[0].count);
    console.log(`  Found ${totalPosts.toLocaleString()} posts to migrate\n`);
    
    if (totalPosts === 0) {
      console.log('⚠️  No data to migrate. Tables created and ready for new data.');
      return;
    }
    
    // Step 3: Migrate creators (deduplicated)
    console.log('👥 Step 3: Migrating creators (deduplicated)...');
    await client.query('BEGIN');
    
    const creatorsResult = await client.query(`
      INSERT INTO creators (
        id, username, display_name, profile_picture_url,
        permalink, follower_count, following_count,
        post_count, verified, first_seen
      )
      SELECT DISTINCT ON (profile_data->>'user_id')
        profile_data->>'user_id',
        profile_data->>'username',
        profile_data->>'display_name',
        profile_data->>'profile_picture_url',
        profile_data->>'permalink',
        COALESCE((profile_data->>'follower_count')::integer, 0),
        COALESCE((profile_data->>'following_count')::integer, 0),
        COALESCE((profile_data->>'post_count')::integer, 0),
        COALESCE((profile_data->>'verified')::boolean, false),
        MIN(indexed_at) OVER (PARTITION BY profile_data->>'user_id')
      FROM sora_posts
      WHERE profile_data->>'user_id' IS NOT NULL
      ON CONFLICT (id) DO UPDATE SET
        follower_count = EXCLUDED.follower_count,
        following_count = EXCLUDED.following_count,
        post_count = EXCLUDED.post_count,
        last_updated = CURRENT_TIMESTAMP
    `);
    
    await client.query('COMMIT');
    console.log(`✅ Migrated ${creatorsResult.rowCount} unique creators\n`);
    
    // Step 4: Migrate posts
    console.log('📝 Step 4: Migrating posts...');
    await client.query('BEGIN');
    
    const postsResult = await client.query(`
      INSERT INTO posts_new (
        id, creator_id, text, posted_at, updated_at, permalink,
        video_url, video_url_md, thumbnail_url, gif_url,
        width, height, generation_id, task_id,
        indexed_at, last_updated
      )
      SELECT 
        sp.id,
        sp.profile_data->>'user_id',
        sp.text,
        sp.posted_at,
        sp.updated_at,
        sp.permalink,
        sp.post_data->'attachments'->0->'encodings'->'source'->>'path',
        sp.post_data->'attachments'->0->'encodings'->'md'->>'path',
        sp.post_data->'attachments'->0->'encodings'->'thumbnail'->>'path',
        sp.post_data->'attachments'->0->'encodings'->'gif'->>'path',
        (sp.post_data->'attachments'->0->>'width')::integer,
        (sp.post_data->'attachments'->0->>'height')::integer,
        sp.post_data->'attachments'->0->>'generation_id',
        sp.post_data->'attachments'->0->>'task_id',
        sp.indexed_at,
        sp.last_updated
      FROM sora_posts sp
      WHERE sp.profile_data->>'user_id' IS NOT NULL
        AND sp.post_data->'attachments'->0 IS NOT NULL
      ON CONFLICT (id) DO NOTHING
    `);
    
    await client.query('COMMIT');
    console.log(`✅ Migrated ${postsResult.rowCount} posts\n`);
    
    // Step 5: Create indexes
    console.log('🔍 Step 5: Creating optimized indexes...');
    await client.query('BEGIN');
    
    console.log('  - Creating posts indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_new_creator_id ON posts_new(creator_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_new_posted_at ON posts_new(posted_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_new_indexed_at ON posts_new(indexed_at DESC)');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_new_text_fts 
      ON posts_new USING gin(to_tsvector('english', COALESCE(text, '')))`);
    
    // Enable pg_trgm for fuzzy search
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await client.query('CREATE INDEX IF NOT EXISTS idx_posts_new_text_trgm ON posts_new USING gin(text gin_trgm_ops)');
      console.log('  - Created trigram index for fuzzy search');
    } catch (error) {
      console.log('  ⚠️  Trigram index skipped (pg_trgm not available)');
    }
    
    console.log('  - Creating creators indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_creators_username ON creators(username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_creators_verified ON creators(verified) WHERE verified = true');
    
    await client.query('COMMIT');
    console.log('✅ Indexes created successfully\n');
    
    // Step 6: Verify migration
    console.log('✔️  Step 6: Verifying migration...');
    const newPostsCount = await client.query('SELECT COUNT(*) FROM posts_new');
    const creatorsCount = await client.query('SELECT COUNT(*) FROM creators');
    
    console.log(`  - Posts in new table: ${parseInt(newPostsCount.rows[0].count).toLocaleString()}`);
    console.log(`  - Unique creators: ${parseInt(creatorsCount.rows[0].count).toLocaleString()}`);
    console.log(`  - Migration success rate: ${((parseInt(newPostsCount.rows[0].count) / totalPosts) * 100).toFixed(2)}%\n`);
    
    // Step 7: Calculate storage savings
    console.log('💾 Step 7: Calculating storage savings...');
    const oldSize = await client.query(`
      SELECT pg_size_pretty(pg_total_relation_size('sora_posts')) as size,
             pg_total_relation_size('sora_posts') as bytes
    `);
    const newSize = await client.query(`
      SELECT pg_size_pretty(
        pg_total_relation_size('posts_new') + 
        pg_total_relation_size('creators')
      ) as size,
      (pg_total_relation_size('posts_new') + 
       pg_total_relation_size('creators')) as bytes
    `);
    
    const oldBytes = parseInt(oldSize.rows[0].bytes);
    const newBytes = parseInt(newSize.rows[0].bytes);
    const savings = ((oldBytes - newBytes) / oldBytes * 100).toFixed(2);
    
    console.log(`  - Old schema size: ${oldSize.rows[0].size}`);
    console.log(`  - New schema size: ${newSize.rows[0].size}`);
    console.log(`  - Storage savings: ${savings}% (${pg_size_pretty(oldBytes - newBytes)})\n`);
    
    console.log('================================================');
    console.log('✅ Migration completed successfully!');
    console.log('================================================\n');
    
    console.log('📋 Next Steps:');
    console.log('1. Test queries on new schema: SELECT p.*, c.* FROM posts_new p JOIN creators c ON p.creator_id = c.id LIMIT 10');
    console.log('2. Update scanner to use new schema');
    console.log('3. Update API endpoints to use new schema');
    console.log('4. After verification (24h), run: node scripts/finalize-migration.js');
    console.log('   This will rename posts_new -> posts and backup old table\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function pg_size_pretty(bytes) {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Run migration
migrateToNormalizedSchema()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });

