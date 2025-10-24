#!/usr/bin/env node

/**
 * Quick status check script to see current content availability
 */

const Database = require('better-sqlite3');
const path = require('path');

async function checkContentStatus(displayId) {
  console.log('📊 Content Status Check');
  console.log('=======================\n');

  try {
    const dbPath = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db = new Database(dbPath);
    
    // Get display and playlist info
    const display = db.prepare('SELECT * FROM displays WHERE id = ?').get(displayId);
    if (!display) {
      console.log(`❌ Display ${displayId} not found`);
      db.close();
      return;
    }
    
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(display.current_playlist_id);
    if (!playlist) {
      console.log(`❌ No active playlist`);
      db.close();
      return;
    }
    
    console.log(`📺 Display: ${display.name}`);
    console.log(`🎵 Playlist: ${playlist.name}`);
    
    // Get unique search terms
    const blocks = db.prepare('SELECT DISTINCT search_term FROM playlist_blocks WHERE playlist_id = ?').all(playlist.id);
    
    console.log(`\n📋 Content Status:`);
    console.log('─'.repeat(50));
    
    for (const block of blocks) {
      const searchTerm = block.search_term;
      
      // Count used videos
      const usedStmt = db.prepare(`
        SELECT COUNT(DISTINCT vh.video_id) as used_count
        FROM video_history vh
        JOIN playlist_blocks pb ON vh.block_id = pb.id
        WHERE pb.search_term = ? AND pb.playlist_id = ?
      `);
      const usedCount = usedStmt.get(searchTerm, playlist.id).used_count;
      
      // Count needed videos
      const neededStmt = db.prepare(`
        SELECT SUM(video_count) as total_needed FROM playlist_blocks 
        WHERE playlist_id = ? AND search_term = ?
      `);
      const totalNeeded = neededStmt.get(playlist.id, searchTerm).total_needed;
      
      const status = usedCount >= totalNeeded ? '🔄 EXHAUSTED' : '✅ AVAILABLE';
      const remaining = Math.max(0, totalNeeded - usedCount);
      
      console.log(`${status} "${searchTerm}"`);
      console.log(`   Used: ${usedCount}/${totalNeeded} (${remaining} remaining)`);
    }
    
    // Check timeline
    const timelineCount = db.prepare('SELECT COUNT(*) as count FROM timeline_videos WHERE display_id = ?').get(displayId).count;
    console.log(`\n📺 Timeline: ${timelineCount} videos queued`);
    
    if (timelineCount === 0) {
      console.log('⚠️ Timeline is empty - system may need to repopulate');
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

const displayId = process.argv[2] || 'SW1VTZ';
checkContentStatus(displayId);
