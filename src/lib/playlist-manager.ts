import { queueDb } from './sqlite';
import { Playlist, PlaylistBlock, BlockDefinition } from '@/types/timeline';
import { v4 as uuidv4 } from 'uuid';

export class PlaylistManager {
  // Create a new playlist
  static createPlaylist(displayId: string, name: string, blocks: BlockDefinition[]): Playlist {
    const playlistId = uuidv4();
    const totalVideos = blocks.reduce((sum, block) => sum + block.videoCount, 0);
    
    // Start transaction
    const transaction = queueDb.transaction(() => {
      // Create playlist
      const playlistStmt = queueDb.prepare(`
        INSERT INTO playlists (id, display_id, name, total_blocks, total_videos, is_active)
        VALUES (?, ?, ?, ?, ?, false)
      `);
      playlistStmt.run(playlistId, displayId, name, blocks.length, totalVideos);

      // Create blocks
      const blockStmt = queueDb.prepare(`
        INSERT INTO playlist_blocks (id, playlist_id, search_term, video_count, fetch_mode, block_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      blocks.forEach((block, index) => {
        const blockId = uuidv4();
        blockStmt.run(blockId, playlistId, block.searchTerm, block.videoCount, block.fetchMode, index);
      });
    });

    transaction();
    return this.getPlaylist(playlistId)!;
  }

  // Get playlist by ID
  static getPlaylist(id: string): Playlist | null {
    const stmt = queueDb.prepare('SELECT * FROM playlists WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      display_id: row.display_id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_active: !!row.is_active,
      total_blocks: row.total_blocks,
      total_videos: row.total_videos,
      loop_count: row.loop_count
    };
  }

  // Get playlists for a display
  static getPlaylistsForDisplay(displayId: string): Playlist[] {
    const stmt = queueDb.prepare('SELECT * FROM playlists WHERE display_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(displayId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      display_id: row.display_id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_active: !!row.is_active,
      total_blocks: row.total_blocks,
      total_videos: row.total_videos,
      loop_count: row.loop_count
    }));
  }

  // Get blocks for a playlist
  static getPlaylistBlocks(playlistId: string): PlaylistBlock[] {
    const stmt = queueDb.prepare(`
      SELECT * FROM playlist_blocks 
      WHERE playlist_id = ? 
      ORDER BY block_order ASC
    `);
    const rows = stmt.all(playlistId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      playlist_id: row.playlist_id,
      search_term: row.search_term,
      video_count: row.video_count,
      fetch_mode: row.fetch_mode,
      block_order: row.block_order,
      created_at: row.created_at,
      times_played: row.times_played,
      last_played_at: row.last_played_at
    }));
  }

  // Set active playlist for display
  static setActivePlaylist(displayId: string, playlistId: string): void {
    const transaction = queueDb.transaction(() => {
      // Deactivate all playlists for this display
      const deactivateStmt = queueDb.prepare(`
        UPDATE playlists SET is_active = false WHERE display_id = ?
      `);
      deactivateStmt.run(displayId);

      // Activate the selected playlist
      const activateStmt = queueDb.prepare(`
        UPDATE playlists SET is_active = true WHERE id = ?
      `);
      activateStmt.run(playlistId);

      // Update display's current playlist
      const displayStmt = queueDb.prepare(`
        UPDATE displays SET current_playlist_id = ?, timeline_position = 0 WHERE id = ?
      `);
      displayStmt.run(playlistId, displayId);
    });

    transaction();
  }

  // Get active playlist for display
  static getActivePlaylist(displayId: string): Playlist | null {
    const stmt = queueDb.prepare(`
      SELECT * FROM playlists 
      WHERE display_id = ? AND is_active = true
    `);
    const row = stmt.get(displayId) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      display_id: row.display_id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_active: !!row.is_active,
      total_blocks: row.total_blocks,
      total_videos: row.total_videos,
      loop_count: row.loop_count
    };
  }

  // Delete playlist
  static deletePlaylist(id: string): void {
    const stmt = queueDb.prepare('DELETE FROM playlists WHERE id = ?');
    stmt.run(id);
  }

  // Update playlist name
  static updatePlaylistName(id: string, name: string): void {
    const stmt = queueDb.prepare(`
      UPDATE playlists SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    stmt.run(name, id);
  }

  // Increment loop count
  static incrementLoopCount(playlistId: string): void {
    const stmt = queueDb.prepare(`
      UPDATE playlists SET loop_count = loop_count + 1 WHERE id = ?
    `);
    stmt.run(playlistId);
  }

  // Update block play statistics
  static updateBlockPlayStats(blockId: string): void {
    const stmt = queueDb.prepare(`
      UPDATE playlist_blocks 
      SET times_played = times_played + 1, last_played_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(blockId);
  }
}
