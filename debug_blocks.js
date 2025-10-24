const Database = require('better-sqlite3');
const db = new Database('./data/queue_system.db');

console.log('📊 Timeline Videos with Block Info for display 5G8ZZ1:');
const videos = db.prepare(`
  SELECT tv.video_id, tv.block_position, tv.timeline_position, tv.status, 
         pb.search_term, pb.video_count
  FROM timeline_videos tv
  JOIN playlist_blocks pb ON tv.block_id = pb.id
  WHERE tv.display_id = '5G8ZZ1' 
  ORDER BY tv.timeline_position 
  LIMIT 10
`).all();

videos.forEach(video => {
  console.log(`Timeline: ${video.timeline_position}, Block: ${video.block_position}, Status: ${video.status}, Term: "${video.search_term}" (${video.video_count} videos), VideoID: ${video.video_id.substring(0, 8)}...`);
});

db.close();
