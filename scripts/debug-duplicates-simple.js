#!/usr/bin/env node

/**
 * Simple debug script to investigate duplicate videos in playlists
 * This script directly queries the SQLite database without TypeScript imports
 */

const Database = require('better-sqlite3');
const path = require('path');

async function debugDuplicateVideos(displayId) {
  console.log('🔍 Duplicate Videos Debug Tool');
  console.log('===============================\n');

  if (!displayId) {
    console.log('❌ Please provide a display ID');
    console.log('Usage: node scripts/debug-duplicates-simple.js <display-id>');
    process.exit(1);
  }

  try {
    // Connect to SQLite database
    const dbPath = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db = new Database(dbPath);
    
    console.log(`📺 Checking duplicate videos for display: ${displayId}`);
    
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
    
    // Get all timeline videos for this display and playlist
    const timelineStmt = db.prepare(`
      SELECT tv.*, pb.search_term, pb.block_order, pb.format
      FROM timeline_videos tv
      JOIN playlist_blocks pb ON tv.block_id = pb.id
      WHERE tv.display_id = ? AND tv.playlist_id = ?
      ORDER BY tv.timeline_position ASC
    `);
    const timelineVideos = timelineStmt.all(displayId, playlist.id);
    
    console.log(`\n📊 Timeline Analysis:`);
    console.log(`   Total videos in timeline: ${timelineVideos.length}`);
    
    // Check for duplicate video IDs
    const videoIdCounts = {};
    const duplicateVideos = [];
    
    timelineVideos.forEach(video => {
      const videoData = JSON.parse(video.video_data || '{}');
      const videoId = videoData.post?.id;
      const username = videoData.profile?.username || 'Unknown';
      const text = videoData.post?.text || 'No text';
      
      if (videoId) {
        if (!videoIdCounts[videoId]) {
          videoIdCounts[videoId] = [];
        }
        videoIdCounts[videoId].push({
          timelinePosition: video.timeline_position,
          blockOrder: video.block_order,
          searchTerm: video.search_term,
          username,
          text: text.substring(0, 60) + (text.length > 60 ? '...' : '')
        });
      }
    });
    
    // Find duplicates
    Object.keys(videoIdCounts).forEach(videoId => {
      if (videoIdCounts[videoId].length > 1) {
        duplicateVideos.push({
          videoId,
          occurrences: videoIdCounts[videoId]
        });
      }
    });
    
    console.log(`   Unique videos: ${Object.keys(videoIdCounts).length}`);
    console.log(`   Duplicate videos: ${duplicateVideos.length}`);
    
    if (duplicateVideos.length > 0) {
      console.log(`\n🚨 DUPLICATE VIDEOS FOUND:`);
      console.log('─'.repeat(60));
      
      duplicateVideos.forEach((duplicate, index) => {
        console.log(`\n${index + 1}. Video ID: ${duplicate.videoId}`);
        console.log(`   Appears ${duplicate.occurrences.length} times:`);
        
        duplicate.occurrences.forEach((occurrence, occIndex) => {
          console.log(`     ${occIndex + 1}. Position ${occurrence.timelinePosition} (Block ${occurrence.blockOrder}: "${occurrence.searchTerm}")`);
          console.log(`        @${occurrence.username}: "${occurrence.text}"`);
        });
      });
    } else {
      console.log(`\n✅ No duplicate videos found!`);
    }
    
    // Check for the specific "Interdimensional Cable" video
    console.log(`\n🔍 Checking for "Interdimensional Cable" videos:`);
    const interdimensionalVideos = timelineVideos.filter(video => {
      const videoData = JSON.parse(video.video_data || '{}');
      const text = videoData.post?.text || '';
      return text.toLowerCase().includes('interdimensional');
    });
    
    console.log(`   Found ${interdimensionalVideos.length} "Interdimensional" videos:`);
    interdimensionalVideos.forEach((video, index) => {
      const videoData = JSON.parse(video.video_data || '{}');
      const username = videoData.profile?.username || 'Unknown';
      const text = videoData.post?.text || 'No text';
      console.log(`     ${index + 1}. Position ${video.timeline_position} (Block ${video.block_order}: "${video.search_term}")`);
      console.log(`        @${username}: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    });
    
    // Check exclusion logic
    console.log(`\n🔍 Checking exclusion logic:`);
    const blocksStmt = db.prepare('SELECT * FROM playlist_blocks WHERE playlist_id = ? ORDER BY block_order');
    const blocks = blocksStmt.all(playlist.id);
    
    for (const block of blocks) {
      console.log(`\n   Block: "${block.search_term}" (${block.video_count} videos)`);
      
      // Get videos already played for this block
      const playedStmt = db.prepare(`
        SELECT DISTINCT video_id FROM timeline_videos 
        WHERE block_id = ? AND status = 'played'
      `);
      const playedVideos = playedStmt.all(block.id);
      console.log(`     Already played videos: ${playedVideos.length}`);
      
      // Get all videos for this block (including queued)
      const allStmt = db.prepare(`
        SELECT video_id FROM timeline_videos 
        WHERE block_id = ?
      `);
      const allVideos = allStmt.all(block.id);
      console.log(`     Total videos in block: ${allVideos.length}`);
      
      // Check for duplicates within this block
      const blockVideoIds = allVideos.map(v => v.video_id);
      const uniqueBlockVideos = [...new Set(blockVideoIds)];
      if (blockVideoIds.length !== uniqueBlockVideos.length) {
        console.log(`     ⚠️ DUPLICATES in this block: ${blockVideoIds.length - uniqueBlockVideos.length} duplicate videos`);
      } else {
        console.log(`     ✅ No duplicates in this block`);
      }
    }
    
    console.log(`\n✅ Debug complete!`);
    db.close();
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// Get display ID from command line arguments
const displayId = process.argv[2] || 'SW1VTZ';
debugDuplicateVideos(displayId).catch(console.error);
