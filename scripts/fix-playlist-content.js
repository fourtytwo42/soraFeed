#!/usr/bin/env node

/**
 * Fix script to resolve playlist content issues
 * This script clears the timeline and repopulates it with correct content
 */

const { queueDb } = require('../src/lib/sqlite.ts');
const { PlaylistManager } = require('../src/lib/playlist-manager.ts');
const { QueueManager } = require('../src/lib/queue-manager.ts');

async function fixPlaylistContent(displayId) {
  console.log('🔧 SoraFeed Playlist Fix Tool');
  console.log('==============================\n');

  if (!displayId) {
    console.log('❌ Please provide a display ID');
    console.log('Usage: node scripts/fix-playlist-content.js <display-id>');
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
    
    console.log(`📺 Fixing playlist for display: ${display.name} (${display.id})`);
    console.log(`   Current playlist: ${display.current_playlist_id || 'None'}`);
    console.log(`   Timeline position: ${display.timeline_position}`);
    
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
      console.log(`     ${index + 1}. "${block.search_term}" (${block.video_count} videos)`);
    });
    
    // Ask for confirmation
    console.log('\n⚠️  This will:');
    console.log('   1. Clear all timeline videos for this display');
    console.log('   2. Reset timeline position to 0');
    console.log('   3. Repopulate the timeline with fresh content');
    console.log('   4. This may cause a brief interruption in playback');
    
    // For automated execution, we'll proceed without confirmation
    console.log('\n🔄 Proceeding with fix...');
    
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
    
    // Repopulate timeline
    console.log('🎬 Repopulating timeline with fresh content...');
    await QueueManager.populateTimelineVideos(displayId, playlist.id, 0);
    console.log('   Timeline repopulated successfully');
    
    // Verify the fix
    console.log('\n✅ Verification:');
    const verifyStmt = queueDb.prepare(`
      SELECT COUNT(*) as count FROM timeline_videos 
      WHERE display_id = ? AND playlist_id = ?
    `);
    const videoCount = verifyStmt.get(displayId, playlist.id).count;
    console.log(`   Timeline now contains ${videoCount} videos`);
    
    // Show first few videos to verify content
    const sampleStmt = queueDb.prepare(`
      SELECT tv.*, pb.search_term, pb.block_order
      FROM timeline_videos tv
      JOIN playlist_blocks pb ON tv.block_id = pb.id
      WHERE tv.display_id = ? AND tv.playlist_id = ?
      ORDER BY tv.timeline_position ASC
      LIMIT 5
    `);
    const sampleVideos = sampleStmt.all(displayId, playlist.id);
    
    console.log('\n📋 Sample of new timeline content:');
    sampleVideos.forEach((video, index) => {
      const videoData = JSON.parse(video.video_data || '{}');
      const text = videoData.post?.text || 'No text';
      const username = videoData.profile?.username || 'Unknown';
      console.log(`   ${index + 1}. [Block: ${video.block_order}] @${username}`);
      console.log(`      Text: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
    });
    
    console.log('\n🎉 Playlist fix completed successfully!');
    console.log('   The display should now show the correct content for each playlist block.');
    
  } catch (error) {
    console.error('❌ Error during fix:', error);
    process.exit(1);
  }
}

// Get display ID from command line arguments
const displayId = process.argv[2];
fixPlaylistContent(displayId).catch(console.error);
