let Pool: typeof import('pg').Pool;
let pool: import('pg').Pool | undefined;

// Dynamically import pg only when needed (server-side)
async function getPool() {
  if (!pool && typeof window === 'undefined') {
    try {
      // Try to import pg module
      const pg = await import('pg');
      Pool = pg.Pool;
      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'sora_feed',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    } catch (error) {
      console.error('Failed to load pg module:', error);
      // Return a mock pool that throws helpful errors
      return {
        query: () => {
          throw new Error('PostgreSQL module not available. Please run: npm install pg @types/pg');
        }
      };
    }
  }
  return pool;
}

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const pool = await getPool();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function getClient() {
  const pool = await getPool();
  if (pool && typeof pool.connect === 'function') {
    const client = await pool.connect();
    return client;
  } else {
    throw new Error('PostgreSQL module not available. Please run: npm install pg @types/pg');
  }
}

export async function initDatabase() {
  const client = await getClient();
  try {
    // Enable pg_trgm extension for fuzzy matching
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('✅ pg_trgm extension enabled');
    } catch (error) {
      console.log('⚠️ pg_trgm extension check:', error);
    }

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

    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_posted_at ON sora_posts(posted_at DESC);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_indexed_at ON sora_posts(indexed_at DESC);
    `);

    // Full-text search index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sora_posts_text ON sora_posts USING gin(to_tsvector('english', text));
    `);

    // Trigram index for fuzzy matching
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sora_posts_text_trgm 
        ON sora_posts USING gin(text gin_trgm_ops)
      `);
      console.log('✅ Trigram index created');
    } catch (error) {
      console.log('⚠️ Trigram index check:', error);
    }

    // Create scanner_stats table for tracking scanner metrics
    await client.query(`
      CREATE TABLE IF NOT EXISTS scanner_stats (
        id SERIAL PRIMARY KEY,
        total_scanned INTEGER DEFAULT 0,
        new_posts INTEGER DEFAULT 0,
        duplicate_posts INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        last_scan_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scan_duration_ms INTEGER DEFAULT 0,
        status TEXT DEFAULT 'idle'
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

export default { getPool };

