import { queueDb, generateUniqueDisplayCode } from './sqlite';
import { Display, DisplayCommand } from '@/types/timeline';
import { v4 as uuidv4 } from 'uuid';

export class DisplayManager {
  // Create a new display with auto-generated code
  static createDisplay(name: string): Display {
    const id = generateUniqueDisplayCode();
    const stmt = queueDb.prepare(`
      INSERT INTO displays (id, name, status, current_position, timeline_position, commands, 
                           playback_state, is_playing, is_muted, video_position, last_state_change)
      VALUES (?, ?, 'offline', 0, 0, '[]', 'idle', false, true, 0, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(id, name);
    
    return this.getDisplay(id)!;
  }

  // Create a new display with specific code
  static createDisplayWithCode(name: string, code: string): Display {
    const stmt = queueDb.prepare(`
      INSERT INTO displays (id, name, status, current_position, timeline_position, commands,
                           playback_state, is_playing, is_muted, video_position, last_state_change)
      VALUES (?, ?, 'offline', 0, 0, '[]', 'idle', false, true, 0, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(code, name);
    
    return this.getDisplay(code)!;
  }

  // Get display by ID
  static getDisplay(id: string): Display | null {
    const stmt = queueDb.prepare('SELECT * FROM displays WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      last_ping: row.last_ping,
      status: row.status,
      current_video_id: row.current_video_id,
      current_position: row.current_position,
      current_block_id: row.current_block_id,
      current_playlist_id: row.current_playlist_id,
      timeline_position: row.timeline_position,
      commands: row.commands,
      playback_state: row.playback_state || 'idle',
      is_playing: Boolean(row.is_playing),
      is_muted: Boolean(row.is_muted),
      video_position: row.video_position || 0,
      last_state_change: row.last_state_change
    };
  }

  // Get all displays
  static getAllDisplays(): Display[] {
    const stmt = queueDb.prepare('SELECT * FROM displays ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      last_ping: row.last_ping,
      status: row.status,
      current_video_id: row.current_video_id,
      current_position: row.current_position,
      current_block_id: row.current_block_id,
      current_playlist_id: row.current_playlist_id,
      timeline_position: row.timeline_position,
      commands: row.commands,
      playback_state: row.playback_state || 'idle',
      is_playing: Boolean(row.is_playing),
      is_muted: Boolean(row.is_muted),
      video_position: row.video_position || 0,
      last_state_change: row.last_state_change,
      last_video_start_time: row.last_video_start_time
    }));
  }

  // Update display status (called by VM client)
  static updateDisplayStatus(
    id: string, 
    updates: Partial<Pick<Display, 'status' | 'current_video_id' | 'current_position' | 'current_block_id' | 'timeline_position' | 'last_video_start_time'>>
  ): void {
    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setParts.push('status = ?');
      values.push(updates.status);
    }
    if (updates.current_video_id !== undefined) {
      setParts.push('current_video_id = ?');
      values.push(updates.current_video_id);
    }
    if (updates.current_position !== undefined) {
      setParts.push('current_position = ?');
      values.push(updates.current_position);
    }
    if (updates.current_block_id !== undefined) {
      setParts.push('current_block_id = ?');
      values.push(updates.current_block_id);
    }
    if (updates.timeline_position !== undefined) {
      setParts.push('timeline_position = ?');
      values.push(updates.timeline_position);
    }
    if (updates.last_video_start_time !== undefined) {
      setParts.push('last_video_start_time = ?');
      values.push(updates.last_video_start_time);
    }

    // Always update last_ping
    setParts.push('last_ping = CURRENT_TIMESTAMP');
    
    if (setParts.length === 1) return; // Only last_ping, no other updates

    const stmt = queueDb.prepare(`
      UPDATE displays 
      SET ${setParts.join(', ')}
      WHERE id = ?
    `);
    
    values.push(id);
    stmt.run(...values);
  }

  // Update playback state (called by admin or VM client)
  static updatePlaybackState(
    id: string,
    updates: {
      playback_state?: 'idle' | 'playing' | 'paused' | 'loading';
      is_playing?: boolean;
      is_muted?: boolean;
      video_position?: number;
    }
  ): void {
    const display = this.getDisplay(id);
    if (!display) throw new Error('Display not found');

    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.playback_state !== undefined) {
      setParts.push('playback_state = ?');
      values.push(updates.playback_state);
    }
    if (updates.is_playing !== undefined) {
      setParts.push('is_playing = ?');
      // Convert boolean to integer for SQLite (0 or 1)
      values.push(updates.is_playing ? 1 : 0);
    }
    if (updates.is_muted !== undefined) {
      setParts.push('is_muted = ?');
      // Convert boolean to integer for SQLite (0 or 1)
      values.push(updates.is_muted ? 1 : 0);
    }
    if (updates.video_position !== undefined) {
      setParts.push('video_position = ?');
      values.push(updates.video_position);
    }

    if (setParts.length === 0) return;

    // Always update last_state_change and last_ping
    setParts.push('last_state_change = CURRENT_TIMESTAMP');
    setParts.push('last_ping = CURRENT_TIMESTAMP');

    const stmt = queueDb.prepare(`
      UPDATE displays 
      SET ${setParts.join(', ')}
      WHERE id = ?
    `);
    
    values.push(id);
    stmt.run(...values);
    
    console.log(`📊 Updated playback state for display ${id}:`, updates);
  }

  // Admin command methods - these now update database directly
  static playDisplay(displayId: string): void {
    this.updatePlaybackState(displayId, {
      playback_state: 'playing',
      is_playing: true
    });
    
    // Trigger full population of all blocks when starting playback
    const { PlaylistManager } = require('./playlist-manager');
    const { QueueManager } = require('./queue-manager');
    
    const playlist = PlaylistManager.getActivePlaylist(displayId);
    if (playlist) {
      console.log(`🚀 Display ${displayId} started playing, force populating all blocks`);
      // Force populate all blocks immediately when starting playback
      QueueManager.forcePopulateAllBlocks(displayId, playlist.id).catch(error => {
        console.error(`❌ Error in force population for ${displayId}:`, error);
      });
    }
  }

  static pauseDisplay(displayId: string): void {
    this.updatePlaybackState(displayId, {
      playback_state: 'paused',
      is_playing: false
    });
  }

  static stopDisplay(displayId: string): void {
    const transaction = queueDb.transaction(() => {
      // Reset display playback state
      const displayStmt = queueDb.prepare(`
        UPDATE displays 
        SET playback_state = 'idle', is_playing = false, current_position = 0, 
            timeline_position = 0, current_video_id = NULL, current_block_id = NULL,
            video_position = 0, last_state_change = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      displayStmt.run(displayId);

      // Clear all timeline videos for this display
      const timelineStmt = queueDb.prepare(`
        DELETE FROM timeline_videos WHERE display_id = ?
      `);
      timelineStmt.run(displayId);

      // Clear video history for this display
      const historyStmt = queueDb.prepare(`
        DELETE FROM video_history WHERE display_id = ?
      `);
      historyStmt.run(displayId);

      // Reset block play statistics
      const blockStatsStmt = queueDb.prepare(`
        UPDATE playlist_blocks 
        SET times_played = 0 
        WHERE id IN (
          SELECT pb.id FROM playlist_blocks pb
          JOIN playlists p ON pb.playlist_id = p.id
          WHERE p.display_id = ?
        )
      `);
      blockStatsStmt.run(displayId);
    });

    transaction();
    console.log(`🛑 Display ${displayId} stopped - all state reset`);
  }

  static muteDisplay(displayId: string): void {
    this.updatePlaybackState(displayId, {
      is_muted: true
    });
  }

  static unmuteDisplay(displayId: string): void {
    this.updatePlaybackState(displayId, {
      is_muted: false
    });
  }

  static seekDisplay(displayId: string, position: number): void {
    this.updatePlaybackState(displayId, {
      video_position: position
    });
  }

  // Legacy command methods for backward compatibility (deprecated)
  static addCommand(displayId: string, command: DisplayCommand): void {
    console.warn('⚠️ addCommand is deprecated. Use direct playback state methods instead.');
    
    // Convert old commands to new playback state updates
    switch (command.type) {
      case 'play':
        this.playDisplay(displayId);
        break;
      case 'pause':
        this.pauseDisplay(displayId);
        break;
      case 'mute':
        this.muteDisplay(displayId);
        break;
      case 'unmute':
        this.unmuteDisplay(displayId);
        break;
      case 'seek':
        if (command.payload?.position !== undefined) {
          this.seekDisplay(displayId, command.payload.position);
        }
        break;
      default:
        // For non-playback commands (like 'next'), still use the old system
        const display = this.getDisplay(displayId);
        if (!display) throw new Error('Display not found');

        const commands = JSON.parse(display.commands) as DisplayCommand[];
        commands.push(command);

        const stmt = queueDb.prepare('UPDATE displays SET commands = ? WHERE id = ?');
        stmt.run(JSON.stringify(commands), displayId);
    }
  }

  // Get and clear commands for display (called by VM client)
  static getAndClearCommands(displayId: string): DisplayCommand[] {
    const display = this.getDisplay(displayId);
    if (!display) return [];

    const commands = JSON.parse(display.commands) as DisplayCommand[];
    
    // Clear commands
    const stmt = queueDb.prepare('UPDATE displays SET commands = \'[]\' WHERE id = ?');
    stmt.run(displayId);

    return commands;
  }

  // Delete display and all associated data
  static deleteDisplay(id: string): boolean {
    const display = this.getDisplay(id);
    if (!display) return false;

    const transaction = queueDb.transaction(() => {
      // Delete in order due to foreign key constraints
      // 1. Delete video history
      queueDb.prepare('DELETE FROM video_history WHERE display_id = ?').run(id);
      
      // 2. Delete timeline videos
      queueDb.prepare('DELETE FROM timeline_videos WHERE display_id = ?').run(id);
      
      // 3. Delete playlist blocks (via playlist cascade)
      queueDb.prepare(`
        DELETE FROM playlist_blocks 
        WHERE playlist_id IN (SELECT id FROM playlists WHERE display_id = ?)
      `).run(id);
      
      // 4. Delete playlists
      queueDb.prepare('DELETE FROM playlists WHERE display_id = ?').run(id);
      
      // 5. Finally delete the display
      queueDb.prepare('DELETE FROM displays WHERE id = ?').run(id);
    });

    transaction();
    console.log(`🗑️ Display ${id} (${display.name}) and all associated data deleted`);
    return true;
  }

  // Update display name
  static updateDisplayName(id: string, name: string): void {
    const stmt = queueDb.prepare('UPDATE displays SET name = ? WHERE id = ?');
    stmt.run(name, id);
  }

  // Check if display is online (pinged within last 30 seconds)
  static isDisplayOnline(display: Display): boolean {
    if (!display.last_ping) return false;
    
    const lastPing = new Date(display.last_ping);
    const now = new Date();
    const diffSeconds = (now.getTime() - lastPing.getTime()) / 1000;
    
    return diffSeconds < 30;
  }

  // Get display statistics
  static getDisplayStats() {
    const totalStmt = queueDb.prepare('SELECT COUNT(*) as total FROM displays');
    const onlineStmt = queueDb.prepare(`
      SELECT COUNT(*) as online FROM displays 
      WHERE last_ping > datetime('now', '-30 seconds')
    `);
    const playingStmt = queueDb.prepare(`
      SELECT COUNT(*) as playing FROM displays 
      WHERE status = 'playing'
    `);

    const total = (totalStmt.get() as any).total;
    const online = (onlineStmt.get() as any).online;
    const playing = (playingStmt.get() as any).playing;

    return { total, online, playing };
  }
}
