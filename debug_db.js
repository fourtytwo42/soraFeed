const Database = require('better-sqlite3');
const db = new Database('./data/queue_system.db');

console.log('📊 Timeline Videos for display 5G8ZZ1:');
const videos = db.prepare(`
  SELECT video_id, block_position, timeline_position, status, block_id 
  FROM timeline_videos 
  WHERE display_id = '5G8ZZ1' 
  ORDER BY timeline_position 
  LIMIT 10
`).all();

videos.forEach(video => {
  console.log(`Timeline: ${video.timeline_position}, Block: ${video.block_position}, Status: ${video.status}, VideoID: ${video.video_id.substring(0, 8)}...`);
});

console.log('\n📊 Current display timeline_position:');
const display = db.prepare(`SELECT timeline_position FROM displays WHERE id = '5G8ZZ1'`).get();
console.log(`Display timeline_position: ${display?.timeline_position || 'Not found'}`);

db.close();
