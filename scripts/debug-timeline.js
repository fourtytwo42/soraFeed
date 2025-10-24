const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/queue_system.db'));

const displayCode = process.argv[2] || 'ATER2F';

console.log('\n📊 Timeline Status for Display:', displayCode);
console.log('='.repeat(80));

// Get display info
const display = db.prepare('SELECT * FROM displays WHERE id = ?').get(displayCode);
if (!display) {
  console.log('❌ Display not found');
  process.exit(1);
}

console.log('\nDisplay Info:');
console.log(`  Timeline Position: ${display.timeline_position}`);
console.log(`  Status: ${display.status}`);

// Get active playlist
const playlist = db.prepare(`
  SELECT * FROM playlists 
  WHERE display_id = ? AND is_active = 1
`).get(displayCode);

if (!playlist) {
  console.log('❌ No active playlist');
  process.exit(1);
}

console.log('\nPlaylist Info:');
console.log(`  Name: ${playlist.name}`);
console.log(`  Total Videos: ${playlist.total_videos}`);
console.log(`  Loop Count: ${playlist.loop_count}`);

// Get blocks and their timeline videos
const blocks = db.prepare(`
  SELECT * FROM playlist_blocks 
  WHERE playlist_id = ? 
  ORDER BY block_order
`).all(playlist.id);

console.log('\n📦 Blocks and Timeline Videos:');
console.log('-'.repeat(80));

let totalExpected = 0;
let totalInTimeline = 0;
let totalPlayed = 0;
let totalQueued = 0;

blocks.forEach((block, index) => {
  const timelineVideos = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM timeline_videos 
    WHERE block_id = ? AND display_id = ?
    GROUP BY status
  `).all(block.id, displayCode);
  
  const played = timelineVideos.find(v => v.status === 'played')?.count || 0;
  const queued = timelineVideos.find(v => v.status === 'queued')?.count || 0;
  const total = played + queued;
  
  totalExpected += block.video_count;
  totalInTimeline += total;
  totalPlayed += played;
  totalQueued += queued;
  
  console.log(`\n${index + 1}. ${block.search_term}`);
  console.log(`   Expected: ${block.video_count} videos`);
  console.log(`   In Timeline: ${total} (${played} played, ${queued} queued)`);
  console.log(`   Times Played (block stats): ${block.times_played}`);
  console.log(`   Block ID: ${block.id.slice(-6)}`);
  
  if (total < block.video_count) {
    console.log(`   ⚠️  MISSING ${block.video_count - total} videos!`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('Summary:');
console.log(`  Expected Total: ${totalExpected} videos`);
console.log(`  In Timeline: ${totalInTimeline} videos`);
console.log(`  Played: ${totalPlayed} videos`);
console.log(`  Queued: ${totalQueued} videos`);
console.log(`  Current Position: ${display.timeline_position} / ${totalExpected}`);

// Check for next video
const nextVideo = db.prepare(`
  SELECT * FROM timeline_videos 
  WHERE display_id = ? AND status = 'queued'
  ORDER BY timeline_position ASC 
  LIMIT 1
`).get(displayCode);

if (nextVideo) {
  console.log('\n🎬 Next Video:');
  console.log(`  Timeline Position: ${nextVideo.timeline_position}`);
  console.log(`  Video ID: ${nextVideo.video_id.slice(-6)}`);
  console.log(`  Block ID: ${nextVideo.block_id.slice(-6)}`);
  
  const block = blocks.find(b => b.id === nextVideo.block_id);
  if (block) {
    console.log(`  Block: ${block.search_term}`);
  }
} else {
  console.log('\n⚠️  No queued videos found!');
}

db.close();

