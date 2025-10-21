const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function finalizeMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Finalizing Database Migration...');
    console.log('===================================\n');
    
    // Step 1: Backup old table
    console.log('📦 Step 1: Backing up old sora_posts table...');
    await client.query('ALTER TABLE IF EXISTS sora_posts RENAME TO sora_posts_backup');
    console.log('✅ Old table backed up as sora_posts_backup\n');
    
    // Step 2: Rename new table to primary
    console.log('🔄 Step 2: Activating new schema...');
    await client.query('ALTER TABLE posts_new RENAME TO sora_posts');
    console.log('✅ posts_new renamed to sora_posts\n');
    
    // Step 3: Update indexes
    console.log('🔍 Step 3: Updating index names...');
    await client.query('ALTER INDEX IF EXISTS idx_posts_new_creator_id RENAME TO idx_posts_creator_id');
    await client.query('ALTER INDEX IF EXISTS idx_posts_new_posted_at RENAME TO idx_posts_posted_at');
    await client.query('ALTER INDEX IF EXISTS idx_posts_new_indexed_at RENAME TO idx_posts_indexed_at');
    await client.query('ALTER INDEX IF EXISTS idx_posts_new_text_fts RENAME TO idx_posts_text_fts');
    await client.query('ALTER INDEX IF EXISTS idx_posts_new_text_trgm RENAME TO idx_posts_text_trgm');
    console.log('✅ Indexes renamed\n');
    
    // Step 4: Run VACUUM to reclaim space
    console.log('🧹 Step 4: Running VACUUM to reclaim storage...');
    await client.query('VACUUM ANALYZE sora_posts');
    await client.query('VACUUM ANALYZE creators');
    console.log('✅ Database optimized\n');
    
    // Step 5: Show final stats
    console.log('📊 Final Statistics:');
    const postsCount = await client.query('SELECT COUNT(*) FROM sora_posts');
    const creatorsCount = await client.query('SELECT COUNT(*) FROM creators');
    const dbSize = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size");
    
    console.log(`  - Total Posts: ${parseInt(postsCount.rows[0].count).toLocaleString()}`);
    console.log(`  - Total Creators: ${parseInt(creatorsCount.rows[0].count).toLocaleString()}`);
    console.log(`  - Database Size: ${dbSize.rows[0].size}\n`);
    
    console.log('===================================');
    console.log('✅ Migration finalized successfully!');
    console.log('===================================\n');
    
    console.log('📋 Post-Migration Notes:');
    console.log('- Old data backed up as: sora_posts_backup');
    console.log('- Keep backup for 7 days before dropping');
    console.log('- To drop backup: DROP TABLE sora_posts_backup CASCADE;');
    console.log('- Scanner and API are now using optimized schema\n');
    
  } catch (error) {
    console.error('❌ Finalization failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

finalizeMigration()
  .then(() => {
    console.log('✅ Finalization completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Finalization failed:', error);
    process.exit(1);
  });

