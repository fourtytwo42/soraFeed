#!/usr/bin/env node

/**
 * Script to manually reset exhausted content for specific search terms
 * This allows you to manually trigger the reset when content is exhausted
 */

const Database = require('better-sqlite3');
const path = require('path');

async function resetExhaustedContent(displayId, searchTerm = null) {
  console.log('🔄 Reset Exhausted Content Tool');
  console.log('================================\n');

  if (!displayId) {
    console.log('❌ Please provide a display ID');
    console.log('Usage: node scripts/reset-exhausted-content.js <display-id> [search-term]');
    console.log('   If no search term is provided, it will reset all exhausted content');
    process.exit(1);
  }

  try {
    // Connect to SQLite database
    const dbPath = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db = new Database(dbPath);
    
    console.log(`📺 Resetting exhausted content for display: ${displayId}`);
    
    // Get display info
    const displayStmt = db.prepare('SELECT * FROM displays WHERE id = ?');
    const display = displayStmt.get(displayId);
    
    if (!display) {
      console.log(`❌ Display with ID ${displayId} not found`);
      db.close();
      process.exit(1);
    }
    
    console.log(`   Display name: ${display.name}`);
    console.log(`   Current playlist: ${display.current_playlist_id || 'None'}`);
    
    if (!display.current_playlist_id) {
      console.log('❌ No active playlist found for this display');
      db.close();
      process.exit(1);
    }
    
    // Get playlist info
    const playlistStmt = db.prepare('SELECT * FROM playlists WHERE id = ?');
    const playlist = playlistStmt.get(display.current_playlist_id);
    
    if (!playlist) {
      console.log('❌ Active playlist not found');
      db.close();
      process.exit(1);
    }
    
    console.log(`\n🎵 Active playlist: "${playlist.name}"`);
    
    // Get all blocks and find exhausted content
    const blocksStmt = db.prepare('SELECT * FROM playlist_blocks WHERE playlist_id = ? ORDER BY block_order');
    const blocks = blocksStmt.all(playlist.id);
    
    const exhaustedSearchTerms = [];
    
    // Analyze each unique search term
    const uniqueSearchTerms = [...new Set(blocks.map(block => block.search_term))];
    
    console.log(`\n🔍 Analyzing ${uniqueSearchTerms.length} unique search terms:`);
    
    for (const searchTermToCheck of uniqueSearchTerms) {
      // Skip if we're only resetting a specific search term
      if (searchTerm && searchTerm !== searchTermToCheck) {
        continue;
      }
      
      // Count videos already played for this search term
      const playedStmt = db.prepare(`
        SELECT COUNT(DISTINCT vh.video_id) as played_count
        FROM video_history vh
        JOIN playlist_blocks pb ON vh.block_id = pb.id
        WHERE pb.search_term = ? AND pb.playlist_id = ?
      `);
      const playedResult = playedStmt.get(searchTermToCheck, playlist.id);
      const playedCount = playedResult.played_count;
      
      // Count videos currently queued for this search term
      const queuedStmt = db.prepare(`
        SELECT COUNT(DISTINCT tv.video_id) as queued_count
        FROM timeline_videos tv
        JOIN playlist_blocks pb ON tv.block_id = pb.id
        WHERE pb.search_term = ? AND pb.playlist_id = ?
      `);
      const queuedResult = queuedStmt.get(searchTermToCheck, playlist.id);
      const queuedCount = queuedResult.queued_count;
      
      const totalUsed = playedCount + queuedCount;
      
      // Calculate total videos needed for this search term
      const totalNeededStmt = db.prepare(`
        SELECT SUM(video_count) as total_needed FROM playlist_blocks 
        WHERE playlist_id = ? AND search_term = ?
      `);
      const totalNeededResult = totalNeededStmt.get(playlist.id, searchTermToCheck);
      const totalNeeded = totalNeededResult.total_needed;
      
      console.log(`\n📦 Search term: "${searchTermToCheck}"`);
      console.log(`   📊 Total videos needed: ${totalNeeded}`);
      console.log(`   📊 Total videos used: ${totalUsed} (${playedCount} played + ${queuedCount} queued)`);
      
      if (totalUsed >= totalNeeded) {
        console.log(`   ✅ Content exhausted - will reset`);
        exhaustedSearchTerms.push(searchTermToCheck);
      } else {
        console.log(`   ⏳ Content not exhausted yet - ${totalNeeded - totalUsed} more videos needed`);
      }
    }
    
    if (exhaustedSearchTerms.length === 0) {
      console.log(`\n✅ No exhausted content found to reset`);
      if (searchTerm) {
        console.log(`   The search term "${searchTerm}" is not exhausted yet`);
      }
      db.close();
      return;
    }
    
    console.log(`\n🔄 Resetting exhausted content for ${exhaustedSearchTerms.length} search terms:`);
    exhaustedSearchTerms.forEach(term => console.log(`   - "${term}"`));
    
    // Reset each exhausted search term
    for (const searchTermToReset of exhaustedSearchTerms) {
      console.log(`\n🗑️ Resetting "${searchTermToReset}"...`);
      
      // Get all blocks with this search term
      const blocksStmt = db.prepare(`
        SELECT id FROM playlist_blocks 
        WHERE playlist_id = ? AND search_term = ?
      `);
      const blocks = blocksStmt.all(playlist.id, searchTermToReset);
      
      if (blocks.length === 0) {
        console.log(`   ⚠️ No blocks found for search term "${searchTermToReset}"`);
        continue;
      }
      
      // Clear video history for all blocks with this search term
      const blockIds = blocks.map(block => block.id);
      const placeholders = blockIds.map(() => '?').join(',');
      
      const deleteStmt = db.prepare(`
        DELETE FROM video_history 
        WHERE block_id IN (${placeholders})
      `);
      
      const result = deleteStmt.run(...blockIds);
      console.log(`   🗑️ Cleared ${result.changes} video history entries`);
      
      // Also clear any queued videos for these blocks
      const clearQueuedStmt = db.prepare(`
        DELETE FROM timeline_videos 
        WHERE block_id IN (${placeholders})
      `);
      
      const queuedResult = clearQueuedStmt.run(...blockIds);
      console.log(`   🗑️ Cleared ${queuedResult.changes} queued videos`);
    }
    
    console.log(`\n🎉 Reset completed successfully!`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Restart your SoraFeed application to use the updated logic`);
    console.log(`   2. The system will automatically repopulate the timeline`);
    console.log(`   3. Videos will now be available again for the reset search terms`);
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error during reset:', error);
  }
}

// Get display ID and optional search term from command line arguments
const displayId = process.argv[2] || 'SW1VTZ';
const searchTerm = process.argv[3] || null;
resetExhaustedContent(displayId, searchTerm).catch(console.error);
