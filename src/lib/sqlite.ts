import Database from 'better-sqlite3';
import path from 'path';

// Initialize SQLite database
const dbPath = path.join(process.cwd(), 'data', 'queue_system.db');
export const queueDb = new Database(dbPath);

// Enable foreign keys
queueDb.pragma('foreign_keys = ON');

// Track if database has been initialized using a more persistent method
const INIT_FLAG_KEY = '__sorafeed_db_initialized__';

// Initialize database tables
export function initQueueDatabase() {
  // Check if already initialized using a global flag
  if ((global as any)[INIT_FLAG_KEY]) {
    return;
  }
  
  // Check if tables already exist to avoid unnecessary work
  const tablesExist = queueDb.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name IN ('displays', 'playlists', 'playlist_blocks', 'timeline_videos', 'video_history')
  `).all();
  
  if (tablesExist.length === 5) {
    // All tables exist, just set the flag and return
    (global as any)[INIT_FLAG_KEY] = true;
    return;
  }
  
  console.log('🗄️ Initializing queue database...');
  (global as any)[INIT_FLAG_KEY] = true;

  // 1. displays table
  queueDb.exec(`
    CREATE TABLE IF NOT EXISTS displays (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_ping DATETIME,
      status TEXT DEFAULT 'offline',
      current_video_id TEXT,
      current_position INTEGER DEFAULT 0,
      current_block_id TEXT,
      current_playlist_id TEXT,
      timeline_position INTEGER DEFAULT 0,
      commands TEXT DEFAULT '[]',
      -- Playback state fields (source of truth)
      playback_state TEXT DEFAULT 'idle',
      is_playing BOOLEAN DEFAULT false,
      is_muted BOOLEAN DEFAULT true,
      video_position REAL DEFAULT 0,
      last_state_change DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. playlists table
  queueDb.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      display_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT false,
      total_blocks INTEGER DEFAULT 0,
      total_videos INTEGER DEFAULT 0,
      loop_count INTEGER DEFAULT 0,
      FOREIGN KEY (display_id) REFERENCES displays(id) ON DELETE CASCADE
    )
  `);

  // 3. playlist_blocks table
  queueDb.exec(`
    CREATE TABLE IF NOT EXISTS playlist_blocks (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      search_term TEXT NOT NULL,
      video_count INTEGER NOT NULL,
      fetch_mode TEXT DEFAULT 'random',
      format TEXT DEFAULT 'mixed',
      block_order INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      times_played INTEGER DEFAULT 0,
      last_played_at DATETIME,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )
  `);

  // 4. timeline_videos table
  queueDb.exec(`
    CREATE TABLE IF NOT EXISTS timeline_videos (
      id TEXT PRIMARY KEY,
      display_id TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      block_position INTEGER NOT NULL,
      timeline_position INTEGER NOT NULL,
      loop_iteration INTEGER DEFAULT 0,
      status TEXT DEFAULT 'queued',
      played_at DATETIME,
      video_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (display_id) REFERENCES displays(id) ON DELETE CASCADE,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (block_id) REFERENCES playlist_blocks(id) ON DELETE CASCADE
    )
  `);

  // 5. video_history table
  queueDb.exec(`
    CREATE TABLE IF NOT EXISTS video_history (
      id TEXT PRIMARY KEY,
      display_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      loop_iteration INTEGER,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (display_id) REFERENCES displays(id) ON DELETE CASCADE,
      FOREIGN KEY (block_id) REFERENCES playlist_blocks(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for performance
  queueDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_displays_status ON displays(status);
    CREATE INDEX IF NOT EXISTS idx_playlists_display_active ON playlists(display_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_blocks_playlist_order ON playlist_blocks(playlist_id, block_order);
    CREATE INDEX IF NOT EXISTS idx_timeline_display_position ON timeline_videos(display_id, timeline_position);
    CREATE INDEX IF NOT EXISTS idx_timeline_status ON timeline_videos(status);
    CREATE INDEX IF NOT EXISTS idx_history_display_video ON video_history(display_id, video_id);
  `);

  // Migration: Add format column if it doesn't exist
  const formatColumnExists = queueDb.prepare(`
    SELECT COUNT(*) as count FROM pragma_table_info('playlist_blocks') WHERE name = 'format'
  `).get() as { count: number };
  
  if (formatColumnExists.count === 0) {
    queueDb.exec(`ALTER TABLE playlist_blocks ADD COLUMN format TEXT DEFAULT 'mixed'`);
    console.log('✅ Added format column to playlist_blocks table');
  }

  // Migration: Add playback state columns to displays table if they don't exist
  const playbackColumns = ['playback_state', 'is_playing', 'is_muted', 'video_position', 'last_state_change'];
  
  for (const column of playbackColumns) {
    const columnExists = queueDb.prepare(`
      SELECT COUNT(*) as count FROM pragma_table_info('displays') WHERE name = ?
    `).get(column) as { count: number };
    
    if (columnExists.count === 0) {
      let columnDef = '';
      switch (column) {
        case 'playback_state':
          columnDef = 'TEXT DEFAULT \'idle\'';
          break;
        case 'is_playing':
          columnDef = 'BOOLEAN DEFAULT false';
          break;
        case 'is_muted':
          columnDef = 'BOOLEAN DEFAULT true';
          break;
        case 'video_position':
          columnDef = 'REAL DEFAULT 0';
          break;
        case 'last_state_change':
          // SQLite doesn't support CURRENT_TIMESTAMP in ALTER TABLE, so just add without default
          columnDef = 'DATETIME';
          break;
      }
      
      try {
        queueDb.exec(`ALTER TABLE displays ADD COLUMN ${column} ${columnDef}`);
        console.log(`✅ Added ${column} column to displays table`);
      } catch (error) {
        console.error(`❌ Failed to add ${column} column:`, error);
      }
    }
  }

  console.log('✅ Queue database initialized successfully');
}

// Helper functions for database operations
export function generateDisplayCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Ensure code is unique
export function generateUniqueDisplayCode(): string {
  let code: string;
  let exists: boolean;
  
  do {
    code = generateDisplayCode();
    const stmt = queueDb.prepare('SELECT id FROM displays WHERE id = ?');
    exists = !!stmt.get(code);
  } while (exists);
  
  return code;
}

// Ensure database is initialized before use
export function ensureInitialized() {
  initQueueDatabase();
}

// Initialize database on first use instead of import
// This prevents repeated initialization in development hot reload
ensureInitialized();
