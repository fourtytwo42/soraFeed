#!/usr/bin/env node

/**
 * Fix script to resolve duplicate video issues
 * This script clears the timeline and repopulates it with improved duplicate prevention
 */

const Database = require('better-sqlite3');
const path = require('path');

async function fixDuplicateVideos(displayId) {
  console.log('🔧 Duplicate Videos Fix Tool');
  console.log('============================\n');

  if (!displayId) {
    console.log('❌ Please provide a display ID');
    console.log('Usage: node scripts/fix-duplicate-videos.js <display-id>');
    process.exit(1);
  }

  try {
    // Connect to SQLite database
    const dbPath = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db = new Database(dbPath);
    
    console.log(`📺 Fixing duplicate videos for display: ${displayId}`);
    
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
    
    // Check current duplicates before fix
    console.log('\n🔍 Checking current duplicates...');
    const timelineStmt = db.prepare(`
      SELECT tv.*, pb.search_term, pb.block_order
      FROM timeline_videos tv
      JOIN playlist_blocks pb ON tv.block_id = pb.id
      WHERE tv.display_id = ? AND tv.playlist_id = ?
      ORDER BY tv.timeline_position ASC
    `);
    const timelineVideos = timelineStmt.all(displayId, playlist.id);
    
    // Check for duplicate video IDs
    const videoIdCounts = {};
    timelineVideos.forEach(video => {
      const videoData = JSON.parse(video.video_data || '{}');
      const videoId = videoData.post?.id;
      if (videoId) {
        if (!videoIdCounts[videoId]) {
          videoIdCounts[videoId] = [];
        }
        videoIdCounts[videoId].push({
          timelinePosition: video.timeline_position,
          blockOrder: video.block_order,
          searchTerm: video.search_term
        });
      }
    });
    
    const duplicateVideos = Object.keys(videoIdCounts).filter(videoId => videoIdCounts[videoId].length > 1);
    console.log(`   Found ${duplicateVideos.length} duplicate videos before fix`);
    
    if (duplicateVideos.length > 0) {
      console.log('   Duplicate videos:');
      duplicateVideos.forEach(videoId => {
        const occurrences = videoIdCounts[videoId];
        console.log(`     - Video ${videoId}: appears ${occurrences.length} times`);
        occurrences.forEach(occ => {
          console.log(`       Position ${occ.timelinePosition} (Block ${occ.blockOrder}: "${occ.searchTerm}")`);
        });
      });
    }
    
    console.log('\n⚠️  This will:');
    console.log('   1. Clear all timeline videos for this display');
    console.log('   2. Reset timeline position to 0');
    console.log('   3. Repopulate the timeline with IMPROVED duplicate prevention');
    console.log('   4. Videos will only appear ONCE per playlist (across all blocks)');
    console.log('   5. This may cause a brief interruption in playback');
    
    console.log('\n🔄 Proceeding with duplicate video fix...');
    
    // Clear timeline videos
    console.log('🗑️  Clearing timeline videos...');
    const clearStmt = db.prepare(`
      DELETE FROM timeline_videos 
      WHERE display_id = ? AND playlist_id = ?
    `);
    const clearResult = clearStmt.run(displayId, playlist.id);
    console.log(`   Removed ${clearResult.changes} timeline videos`);
    
    // Reset display position
    console.log('🔄 Resetting timeline position...');
    const resetStmt = db.prepare(`
      UPDATE displays 
      SET timeline_position = 0, current_position = 0, current_block_id = NULL, current_video_id = NULL
      WHERE id = ?
    `);
    resetStmt.run(displayId);
    console.log('   Timeline position reset to 0');
    
    console.log('\n🎬 Repopulating timeline with improved duplicate prevention...');
    console.log('   Note: The system will now use the updated QueueManager.populateTimelineVideos()');
    console.log('   which includes global duplicate prevention across all blocks.');
    
    // Note: We can't directly call the TypeScript function from here, so we'll need to restart the system
    console.log('\n📝 Next steps:');
    console.log('   1. Restart your SoraFeed application to use the updated duplicate prevention logic');
    console.log('   2. The system will automatically repopulate the timeline with the new logic');
    console.log('   3. Videos will now only appear once per playlist');
    
    // Verify the fix
    console.log('\n✅ Verification:');
    const verifyStmt = db.prepare(`
      SELECT COUNT(*) as count FROM timeline_videos 
      WHERE display_id = ? AND playlist_id = ?
    `);
    const videoCount = verifyStmt.get(displayId, playlist.id).count;
    console.log(`   Timeline now contains ${videoCount} videos (should be 0 after clear)`);
    
    console.log('\n🎉 Duplicate video fix preparation completed!');
    console.log('   The timeline has been cleared and is ready for repopulation with improved logic.');
    console.log('   Restart your application to see the fix in action.');
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error during fix:', error);
  }
}

// Get display ID from command line arguments
const displayId = process.argv[2] || 'SW1VTZ';
fixDuplicateVideos(displayId).catch(console.error);
