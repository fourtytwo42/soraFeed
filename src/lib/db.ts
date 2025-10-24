// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Pool: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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


const db = { getPool };
export default db;

