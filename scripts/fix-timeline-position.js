const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/queue_system.db'));

const displayCode = process.argv[2] || 'ATER2F';

console.log('\n🔧 Fixing Timeline Position for Display:', displayCode);

// Get the highest played video position
const highestPlayed = db.prepare(`
  SELECT MAX(timeline_position) as max_pos 
  FROM timeline_videos 
  WHERE display_id = ? AND status = 'played'
`).get(displayCode);

// Get the lowest queued video position
const lowestQueued = db.prepare(`
  SELECT MIN(timeline_position) as min_pos 
  FROM timeline_videos 
  WHERE display_id = ? AND status = 'queued'
`).get(displayCode);

// Get current display position
const display = db.prepare('SELECT timeline_position FROM displays WHERE id = ?').get(displayCode);

console.log('\nCurrent State:');
console.log(`  Display Position: ${display.timeline_position}`);
console.log(`  Highest Played Position: ${highestPlayed.max_pos}`);
console.log(`  Lowest Queued Position: ${lowestQueued.min_pos}`);

// The correct position should be one after the highest played
const correctPosition = (highestPlayed.max_pos || -1) + 1;

console.log(`\nCorrect Position Should Be: ${correctPosition}`);

if (display.timeline_position !== correctPosition) {
  console.log(`\n⚠️  Position mismatch! Fixing...`);
  
  db.prepare('UPDATE displays SET timeline_position = ? WHERE id = ?')
    .run(correctPosition, displayCode);
  
  console.log(`✅ Updated display position from ${display.timeline_position} to ${correctPosition}`);
} else {
  console.log(`\n✅ Position is correct, no fix needed`);
}

// Mark any queued videos before the correct position as skipped
const videosToSkip = db.prepare(`
  SELECT COUNT(*) as count 
  FROM timeline_videos 
  WHERE display_id = ? AND status = 'queued' AND timeline_position < ?
`).get(displayCode, correctPosition);

if (videosToSkip.count > 0) {
  console.log(`\n⚠️  Found ${videosToSkip.count} queued videos before the correct position`);
  console.log(`   These appear to have been skipped. Marking as 'skipped'...`);
  
  db.prepare(`
    UPDATE timeline_videos 
    SET status = 'skipped' 
    WHERE display_id = ? AND status = 'queued' AND timeline_position < ?
  `).run(displayCode, correctPosition);
  
  console.log(`✅ Marked ${videosToSkip.count} videos as skipped`);
}

db.close();
console.log('\n✅ Timeline fixed!\n');

