import { queueDb, generateUniqueDisplayCode } from './sqlite';
import { Display, DisplayCommand } from '@/types/timeline';
import { v4 as uuidv4 } from 'uuid';

export class DisplayManager {
  // Create a new display with auto-generated code
  static createDisplay(name: string): Display {
    const id = generateUniqueDisplayCode();
    const stmt = queueDb.prepare(`
      INSERT INTO displays (id, name, status, current_position, timeline_position, commands)
      VALUES (?, ?, 'offline', 0, 0, '[]')
    `);
    
    stmt.run(id, name);
    
    return this.getDisplay(id)!;
  }

  // Create a new display with specific code
  static createDisplayWithCode(name: string, code: string): Display {
    const stmt = queueDb.prepare(`
      INSERT INTO displays (id, name, status, current_position, timeline_position, commands)
      VALUES (?, ?, 'offline', 0, 0, '[]')
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
      commands: row.commands
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
      commands: row.commands
    }));
  }

  // Update display status (called by VM client)
  static updateDisplayStatus(
    id: string, 
    updates: Partial<Pick<Display, 'status' | 'current_video_id' | 'current_position' | 'current_block_id' | 'timeline_position'>>
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

  // Add command for display (called by admin)
  static addCommand(displayId: string, command: DisplayCommand): void {
    const display = this.getDisplay(displayId);
    if (!display) throw new Error('Display not found');

    const commands = JSON.parse(display.commands) as DisplayCommand[];
    commands.push(command);

    const stmt = queueDb.prepare('UPDATE displays SET commands = ? WHERE id = ?');
    stmt.run(JSON.stringify(commands), displayId);
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

  // Delete display
  static deleteDisplay(id: string): void {
    const stmt = queueDb.prepare('DELETE FROM displays WHERE id = ?');
    stmt.run(id);
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
