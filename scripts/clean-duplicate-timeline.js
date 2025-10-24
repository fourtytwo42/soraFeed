const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/queue_system.db'));

const displayCode = process.argv[2] || 'ATER2F';

console.log('\n🧹 Cleaning Duplicate Timeline Videos for Display:', displayCode);
console.log('='.repeat(80));

// Get the playlist
const playlist = db.prepare(`
  SELECT * FROM playlists 
  WHERE display_id = ? AND is_active = 1
`).get(displayCode);

if (!playlist) {
  console.log('❌ No active playlist found');
  process.exit(1);
}

// Get blocks
const blocks = db.prepare(`
  SELECT * FROM playlist_blocks 
  WHERE playlist_id = ? 
  ORDER BY block_order
`).all(playlist.id);

console.log(`\nActive Playlist: ${playlist.name}`);
console.log(`Expected Total: ${playlist.total_videos} videos`);

// Count current timeline videos
const currentCount = db.prepare(`
  SELECT COUNT(*) as count FROM timeline_videos 
  WHERE display_id = ?
`).get(displayCode);

console.log(`Current Timeline: ${currentCount.count} videos`);

if (currentCount.count > playlist.total_videos) {
  console.log(`\n⚠️  Found ${currentCount.count - playlist.total_videos} extra videos! Cleaning...`);
  
  // For each block, keep only the first N videos (where N = block.video_count)
  let cleaned = 0;
  
  blocks.forEach(block => {
    // Get all timeline videos for this block, ordered by timeline_position
    const blockVideos = db.prepare(`
      SELECT id, timeline_position FROM timeline_videos 
      WHERE display_id = ? AND block_id = ?
      ORDER BY timeline_position ASC
    `).all(displayCode, block.id);
    
    // Delete videos beyond the expected count
    if (blockVideos.length > block.video_count) {
      const toDelete = blockVideos.slice(block.video_count);
      const deleteStmt = db.prepare('DELETE FROM timeline_videos WHERE id = ?');
      
      toDelete.forEach(video => {
        deleteStmt.run(video.id);
        cleaned++;
      });
      
      console.log(`   ${block.search_term}: Removed ${toDelete.length} duplicates (kept ${block.video_count})`);
    }
  });
  
  console.log(`\n✅ Removed ${cleaned} duplicate videos`);
  
  // Now renumber the timeline positions to be sequential
  console.log('\n🔢 Renumbering timeline positions...');
  
  const allVideos = db.prepare(`
    SELECT id FROM timeline_videos 
    WHERE display_id = ?
    ORDER BY timeline_position ASC
  `).all(displayCode);
  
  const updateStmt = db.prepare('UPDATE timeline_videos SET timeline_position = ? WHERE id = ?');
  
  allVideos.forEach((video, index) => {
    updateStmt.run(index, video.id);
  });
  
  console.log(`✅ Renumbered ${allVideos.length} videos (positions 0-${allVideos.length - 1})`);
  
} else {
  console.log('\n✅ Timeline looks good, no duplicates found');
}

// Final summary
const finalCount = db.prepare(`
  SELECT COUNT(*) as count FROM timeline_videos 
  WHERE display_id = ?
`).get(displayCode);

console.log(`\n📊 Final Timeline: ${finalCount.count} videos`);

db.close();
console.log('\n✅ Cleanup complete!\n');

