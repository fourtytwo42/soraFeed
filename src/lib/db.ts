// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Pool: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;

// Connection queue to prevent overwhelming the database
const connectionQueue: Array<() => void> = [];
let activeConnections = 0;
const MAX_CONCURRENT_CONNECTIONS = 2; // Even more conservative

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
        max: 3, // Further reduced to 3 connections
        min: 1, // Minimum 1 connection
        idleTimeoutMillis: 10000, // Reduced idle timeout
        connectionTimeoutMillis: 10000, // Reduced connection timeout
        query_timeout: 15000, // Reduced query timeout
        statement_timeout: 15000, // Reduced statement timeout
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

// Queued connection function to prevent overwhelming the database
async function getClientQueued(): Promise<any> {
  return new Promise((resolve, reject) => {
    const tryConnect = async () => {
      if (activeConnections >= MAX_CONCURRENT_CONNECTIONS) {
        // Queue the connection request
        connectionQueue.push(tryConnect);
        return;
      }
      
      activeConnections++;
      
      try {
        const pool = await getPool();
        if (pool && typeof pool.connect === 'function') {
          const client = await pool.connect();
          resolve(client);
        } else {
          throw new Error('PostgreSQL module not available. Please run: npm install pg @types/pg');
        }
      } catch (error) {
        activeConnections--;
        reject(error);
      }
    };
    
    tryConnect();
  });
}

// Release connection and process queue
export function releaseClient(client: any) {
  if (client && typeof client.release === 'function') {
    client.release();
  }
  activeConnections--;
  
  // Process next queued connection
  if (connectionQueue.length > 0) {
    const nextConnection = connectionQueue.shift();
    if (nextConnection) {
      setTimeout(nextConnection, 100); // Small delay to prevent rapid connections
    }
  }
}

export async function getClient() {
  return getClientQueued();
}


const db = { getPool };
export default db;

