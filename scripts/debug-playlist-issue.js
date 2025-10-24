#!/usr/bin/env node

/**
 * Debug script to investigate playlist content issues
 * This script helps identify why wrong content is being added to playlists
 */

const { queueDb } = require('../src/lib/sqlite.ts');
const { PlaylistManager } = require('../src/lib/playlist-manager.ts');
const { QueueManager } = require('../src/lib/queue-manager.ts');

async function debugPlaylistIssue() {
  console.log('🔍 SoraFeed Playlist Debug Tool');
  console.log('================================\n');

  try {
    // Get all displays
    const displaysStmt = queueDb.prepare('SELECT * FROM displays');
    const displays = displaysStmt.all();
    
    console.log(`📺 Found ${displays.length} displays:`);
    displays.forEach(display => {
      console.log(`  - ${display.name} (${display.id}) - Status: ${display.status}`);
      console.log(`    Current playlist: ${display.current_playlist_id || 'None'}`);
      console.log(`    Timeline position: ${display.timeline_position}`);
    });
    console.log('');

    // For each display, show active playlists and their blocks
    for (const display of displays) {
      console.log(`🎵 Display: ${display.name} (${display.id})`);
      console.log('─'.repeat(50));
      
      const playlists = PlaylistManager.getPlaylistsForDisplay(display.id);
      console.log(`Found ${playlists.length} playlists:`);
      
      for (const playlist of playlists) {
        console.log(`\n  📋 Playlist: "${playlist.name}" (${playlist.id})`);
        console.log(`     Active: ${playlist.is_active ? '✅' : '❌'}`);
        console.log(`     Total blocks: ${playlist.total_blocks}`);
        console.log(`     Total videos: ${playlist.total_videos}`);
        console.log(`     Loop count: ${playlist.loop_count}`);
        
        // Get blocks for this playlist
        const blocks = PlaylistManager.getPlaylistBlocks(playlist.id);
        console.log(`     Blocks:`);
        
        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          console.log(`       ${i + 1}. "${block.search_term}"`);
          console.log(`          - Videos: ${block.video_count}`);
          console.log(`          - Mode: ${block.fetch_mode}`);
          console.log(`          - Format: ${block.format}`);
          console.log(`          - Times played: ${block.times_played}`);
          console.log(`          - Last played: ${block.last_played_at || 'Never'}`);
        }
        
        // If this is the active playlist, show timeline videos
        if (playlist.is_active) {
          console.log(`\n     🎬 Timeline Videos (showing first 10):`);
          const timelineStmt = queueDb.prepare(`
            SELECT tv.*, pb.search_term, pb.block_order
            FROM timeline_videos tv
            JOIN playlist_blocks pb ON tv.block_id = pb.id
            WHERE tv.display_id = ? AND tv.playlist_id = ?
            ORDER BY tv.timeline_position ASC
            LIMIT 10
          `);
          const timelineVideos = timelineStmt.all(display.id, playlist.id);
          
          timelineVideos.forEach((video, index) => {
            const videoData = JSON.parse(video.video_data || '{}');
            const text = videoData.post?.text || 'No text';
            const username = videoData.profile?.username || 'Unknown';
            console.log(`       ${index + 1}. [Block: ${video.block_order}] @${username}`);
            console.log(`          Text: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
            console.log(`          Status: ${video.status}`);
            console.log(`          Position: ${video.timeline_position}`);
          });
        }
      }
      console.log('\n');
    }

    // Test search functionality for common terms
    console.log('🔍 Testing Search Functionality');
    console.log('─'.repeat(50));
    
    const testTerms = ['commercial', 'movie trailer', 'cartoon', 'music video'];
    
    for (const term of testTerms) {
      console.log(`\nTesting search term: "${term}"`);
      try {
        const results = await QueueManager.searchVideos(term, 3, 'newest', 'mixed', []);
        console.log(`  Found ${results.length} videos:`);
        
        results.forEach((video, index) => {
          const text = video.post.text || 'No text';
          const username = video.profile.username || 'Unknown';
          console.log(`    ${index + 1}. @${username}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
        });
      } catch (error) {
        console.log(`  ❌ Error searching for "${term}":`, error.message);
      }
    }

    console.log('\n✅ Debug complete!');
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// Run the debug function
debugPlaylistIssue().catch(console.error);
