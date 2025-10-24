#!/usr/bin/env node

/**
 * Fix script to resolve format filtering issues
 * This script clears the timeline and repopulates it with strict format filtering
 */

const { queueDb } = require('../src/lib/sqlite.ts');
const { PlaylistManager } = require('../src/lib/playlist-manager.ts');
const { QueueManager } = require('../src/lib/queue-manager.ts');

async function fixFormatFiltering(displayId) {
  console.log('🔧 Format Filtering Fix Tool');
  console.log('=============================\n');

  if (!displayId) {
    console.log('❌ Please provide a display ID');
    console.log('Usage: node scripts/fix-format-filtering.js <display-id>');
    process.exit(1);
  }

  try {
    // Get display info
    const displayStmt = queueDb.prepare('SELECT * FROM displays WHERE id = ?');
    const display = displayStmt.get(displayId);
    
    if (!display) {
      console.log(`❌ Display with ID ${displayId} not found`);
      process.exit(1);
    }
    
    console.log(`📺 Fixing format filtering for display: ${display.name} (${display.id})`);
    console.log(`   Current playlist: ${display.current_playlist_id || 'None'}`);
    
    if (!display.current_playlist_id) {
      console.log('❌ No active playlist found for this display');
      process.exit(1);
    }
    
    const playlist = PlaylistManager.getPlaylist(display.current_playlist_id);
    if (!playlist) {
      console.log('❌ Active playlist not found');
      process.exit(1);
    }
    
    console.log(`\n🎵 Active playlist: "${playlist.name}"`);
    const blocks = PlaylistManager.getPlaylistBlocks(playlist.id);
    console.log(`   Blocks: ${blocks.length}`);
    blocks.forEach((block, index) => {
      console.log(`     ${index + 1}. "${block.search_term}" (${block.video_count} videos, ${block.format} format)`);
    });
    
    console.log('\n⚠️  This will:');
    console.log('   1. Clear all timeline videos for this display');
    console.log('   2. Reset timeline position to 0');
    console.log('   3. Repopulate the timeline with STRICT format filtering');
    console.log('   4. Only videos matching the exact format will be added');
    console.log('   5. This may cause a brief interruption in playback');
    
    console.log('\n🔄 Proceeding with format filtering fix...');
    
    // Clear timeline videos
    console.log('🗑️  Clearing timeline videos...');
    const clearStmt = queueDb.prepare(`
      DELETE FROM timeline_videos 
      WHERE display_id = ? AND playlist_id = ?
    `);
    const clearResult = clearStmt.run(displayId, playlist.id);
    console.log(`   Removed ${clearResult.changes} timeline videos`);
    
    // Reset display position
    console.log('🔄 Resetting timeline position...');
    const resetStmt = queueDb.prepare(`
      UPDATE displays 
      SET timeline_position = 0, current_position = 0, current_block_id = NULL, current_video_id = NULL
      WHERE id = ?
    `);
    resetStmt.run(displayId);
    console.log('   Timeline position reset to 0');
    
    // Repopulate timeline with strict format filtering
    console.log('🎬 Repopulating timeline with STRICT format filtering...');
    await QueueManager.populateTimelineVideos(displayId, playlist.id, 0);
    console.log('   Timeline repopulated with strict format filtering');
    
    // Verify the fix
    console.log('\n✅ Verification:');
    const verifyStmt = queueDb.prepare(`
      SELECT COUNT(*) as count FROM timeline_videos 
      WHERE display_id = ? AND playlist_id = ?
    `);
    const videoCount = verifyStmt.get(displayId, playlist.id).count;
    console.log(`   Timeline now contains ${videoCount} videos`);
    
    // Show first few videos to verify format
    const sampleStmt = queueDb.prepare(`
      SELECT tv.*, pb.search_term, pb.block_order, pb.format
      FROM timeline_videos tv
      JOIN playlist_blocks pb ON tv.block_id = pb.id
      WHERE tv.display_id = ? AND tv.playlist_id = ?
      ORDER BY tv.timeline_position ASC
      LIMIT 10
    `);
    const sampleVideos = sampleStmt.all(displayId, playlist.id);
    
    console.log('\n📋 Sample of new timeline content (with format verification):');
    sampleVideos.forEach((video, index) => {
      const videoData = JSON.parse(video.video_data || '{}');
      const attachment = videoData.post?.attachments?.[0];
      const text = videoData.post?.text || 'No text';
      const username = videoData.profile?.username || 'Unknown';
      const width = attachment?.width || 'unknown';
      const height = attachment?.height || 'unknown';
      const actualFormat = width > height ? 'WIDE' : height > width ? 'TALL' : 'SQUARE';
      const expectedFormat = video.format.toUpperCase();
      const formatMatch = actualFormat === expectedFormat ? '✅' : '❌';
      
      console.log(`   ${index + 1}. [Block: ${video.block_order}] @${username} ${formatMatch}`);
      console.log(`      Expected: ${expectedFormat}, Actual: ${actualFormat} (${width}x${height})`);
      console.log(`      Text: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
    });
    
    console.log('\n🎉 Format filtering fix completed successfully!');
    console.log('   The display should now only show videos matching the exact format for each playlist block.');
    console.log('   ✅ = Format matches expected');
    console.log('   ❌ = Format mismatch (this should not happen with strict filtering)');
    
  } catch (error) {
    console.error('❌ Error during fix:', error);
    process.exit(1);
  }
}

// Get display ID from command line arguments
const displayId = process.argv[2];
fixFormatFiltering(displayId).catch(console.error);
