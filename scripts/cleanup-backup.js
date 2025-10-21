const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function cleanupBackup() {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Removing sora_posts_backup table...');
    
    // Check if backup table exists
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sora_posts_backup'
      );
    `);
    
    if (!checkResult.rows[0].exists) {
      console.log('ℹ️  Backup table does not exist - already cleaned up');
      return;
    }
    
    // Get size before deletion
    const sizeResult = await client.query(`
      SELECT pg_size_pretty(pg_total_relation_size('sora_posts_backup')) as size
    `);
    const backupSize = sizeResult.rows[0].size;
    
    console.log(`📊 Backup table size: ${backupSize}`);
    
    // Drop the backup table
    await client.query('DROP TABLE sora_posts_backup CASCADE');
    console.log('✅ Backup table removed successfully');
    
    // Run VACUUM to reclaim space
    console.log('🧹 Running VACUUM to reclaim space...');
    await client.query('VACUUM');
    console.log('✅ Database space reclaimed');
    
    // Get new database size
    const newSizeResult = await client.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    const newSize = newSizeResult.rows[0].size;
    
    console.log(`📊 New database size: ${newSize}`);
    console.log(`💾 Space saved: ${backupSize}`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupBackup()
  .then(() => {
    console.log('✅ Cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Cleanup failed:', error);
    process.exit(1);
  });
