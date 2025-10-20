const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  console.log('🔍 Testing PostgreSQL connection...');
  
  // First try to connect to the default postgres database
  const defaultPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to default database first
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    const client = await defaultPool.connect();
    console.log('✅ Connected to PostgreSQL successfully!');
    
    // Check PostgreSQL version
    const versionResult = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', versionResult.rows[0].version.split(' ').slice(0, 2).join(' '));
    
    // Check if sora_feed database exists
    const dbCheck = await client.query("SELECT 1 FROM pg_database WHERE datname = 'sora_feed'");
    
    if (dbCheck.rows.length === 0) {
      console.log('🔧 Creating sora_feed database...');
      await client.query('CREATE DATABASE sora_feed');
      console.log('✅ Database sora_feed created successfully!');
    } else {
      console.log('✅ Database sora_feed already exists');
    }
    
    client.release();
    await defaultPool.end();
    
    // Now test connection to sora_feed database
    console.log('🔍 Testing connection to sora_feed database...');
    
    const soraPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'sora_feed',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    });
    
    const soraClient = await soraPool.connect();
    console.log('✅ Connected to sora_feed database successfully!');
    
    // Enable pg_trgm extension for fuzzy matching
    console.log('🔧 Enabling pg_trgm extension...');
    try {
      await soraClient.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('✅ pg_trgm extension enabled');
    } catch (error) {
      console.log('⚠️ pg_trgm extension check:', error);
    }
    
    // Create tables
    console.log('🔧 Creating database tables...');
    
    // Create posts table
    await soraClient.query(`
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
    console.log('🔧 Creating indexes...');
    await soraClient.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_posted_at ON sora_posts(posted_at DESC);
    `);
    
    await soraClient.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_indexed_at ON sora_posts(indexed_at DESC);
    `);
    
    // Full-text search index
    await soraClient.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_text ON sora_posts USING gin(to_tsvector('english', COALESCE(text, '')));
    `);
    
    // Trigram index for fuzzy matching
    try {
      await soraClient.query(`
        CREATE INDEX IF NOT EXISTS idx_sora_posts_text_trgm 
        ON sora_posts USING gin(text gin_trgm_ops)
      `);
      console.log('✅ Trigram index created');
    } catch (error) {
      console.log('⚠️ Trigram index check:', error);
    }
    
    // Create scanner_stats table
    await soraClient.query(`
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
    const statsCheck = await soraClient.query('SELECT COUNT(*) FROM scanner_stats');
    if (parseInt(statsCheck.rows[0].count) === 0) {
      await soraClient.query(`
        INSERT INTO scanner_stats (total_scanned, new_posts, duplicate_posts, errors, status)
        VALUES (0, 0, 0, 0, 'idle')
      `);
      console.log('✅ Scanner stats table initialized');
    }
    
    console.log('✅ Database tables created successfully!');
    
    soraClient.release();
    await soraPool.end();
    
    console.log('\n🎉 Database setup complete!');
    console.log('=====================================');
    console.log('✅ PostgreSQL is running');
    console.log('✅ Database sora_feed created');
    console.log('✅ Tables and indexes created');
    console.log('✅ Scanner stats initialized');
    console.log('');
    console.log('🚀 Ready to start!');
    console.log('==================');
    console.log('1. Start scanner: npm run scanner');
    console.log('2. Visit dashboard: http://localhost:3000/scanner-debug');
    console.log('');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.log('\n🔧 Error details:');
    console.log('Code:', error.code);
    console.log('Detail:', error.detail || 'No additional details');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Troubleshooting:');
      console.log('- PostgreSQL might not be running');
      console.log('- Check: sudo systemctl status postgresql');
      console.log('- Start: sudo systemctl start postgresql');
    } else if (error.code === '28P01') {
      console.log('\n💡 Authentication issue:');
      console.log('- Try setting DB_PASSWORD= (empty) in .env');
      console.log('- Or set a password: sudo -u postgres psql -c "ALTER USER postgres PASSWORD \'yourpassword\';"');
    }
    
    process.exit(1);
  }
}

setupDatabase();
