#!/usr/bin/env node

/**
 * Script to check audio/mute settings for displays
 */

const Database = require('better-sqlite3');
const path = require('path');

async function checkAudioSettings(displayId) {
  console.log('🔊 Audio Settings Check');
  console.log('======================\n');

  if (!displayId) {
    console.log('❌ Please provide a display ID');
    console.log('Usage: node scripts/check-audio-settings.js <display-id>');
    process.exit(1);
  }

  try {
    // Connect to SQLite database
    const dbPath = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db = new Database(dbPath);
    
    console.log(`📺 Checking audio settings for display: ${displayId}`);
    
    // Get display info
    const displayStmt = db.prepare('SELECT * FROM displays WHERE id = ?');
    const display = displayStmt.get(displayId);
    
    if (!display) {
      console.log(`❌ Display with ID ${displayId} not found`);
      db.close();
      process.exit(1);
    }
    
    console.log(`\n📊 Display Information:`);
    console.log(`   Name: ${display.name}`);
    console.log(`   Status: ${display.status}`);
    console.log(`   Current Video ID: ${display.current_video_id || 'None'}`);
    console.log(`   Current Position: ${display.current_position || 0}`);
    console.log(`   Timeline Position: ${display.timeline_position || 0}`);
    
    console.log(`\n🔊 Audio Settings:`);
    console.log(`   is_muted: ${display.is_muted}`);
    console.log(`   playback_state: ${display.playback_state}`);
    console.log(`   is_playing: ${display.is_playing}`);
    console.log(`   video_position: ${display.video_position || 0}`);
    console.log(`   last_state_change: ${display.last_state_change}`);
    
    // Check if there are any commands queued
    let commands = [];
    try {
      commands = JSON.parse(display.commands || '[]');
    } catch (e) {
      console.log(`   ⚠️ Could not parse commands: ${display.commands}`);
    }
    
    console.log(`\n📋 Queued Commands (${commands.length}):`);
    if (commands.length > 0) {
      commands.forEach((cmd, index) => {
        console.log(`   ${index + 1}. ${cmd.type}: ${JSON.stringify(cmd.data || {})}`);
      });
    } else {
      console.log(`   No commands queued`);
    }
    
    // Check current video data
    if (display.current_video_id) {
      console.log(`\n🎬 Current Video Information:`);
      
      // Get video from timeline
      const videoStmt = db.prepare(`
        SELECT tv.*, pb.search_term
        FROM timeline_videos tv
        JOIN playlist_blocks pb ON tv.block_id = pb.id
        WHERE tv.video_id = ? AND tv.display_id = ?
      `);
      const video = videoStmt.get(display.current_video_id, displayId);
      
      if (video) {
        console.log(`   Video ID: ${video.video_id}`);
        console.log(`   Status: ${video.status}`);
        console.log(`   Block: "${video.search_term}"`);
        console.log(`   Timeline Position: ${video.timeline_position}`);
        console.log(`   Block Position: ${video.block_position}`);
        console.log(`   Loop Iteration: ${video.loop_iteration}`);
        console.log(`   Created: ${video.created_at}`);
        
        // Parse video data
        try {
          const videoData = JSON.parse(video.video_data || '{}');
          const post = videoData.post || {};
          const profile = videoData.profile || {};
          
          console.log(`   Post ID: ${post.id || 'Unknown'}`);
          console.log(`   Username: @${profile.username || 'Unknown'}`);
          console.log(`   Text: "${(post.text || '').substring(0, 60)}${(post.text || '').length > 60 ? '...' : ''}"`);
          
          // Check if video has audio
          const attachment = post.attachments?.[0];
          if (attachment) {
            console.log(`   Video URL: ${attachment.url ? 'Present' : 'Missing'}`);
            console.log(`   Video Type: ${attachment.type || 'Unknown'}`);
            console.log(`   Video Size: ${attachment.width || '?'}x${attachment.height || '?'}`);
            console.log(`   Has Audio: ${attachment.hasAudio ? 'Yes' : 'No/Unknown'}`);
          }
        } catch (e) {
          console.log(`   ⚠️ Could not parse video data: ${e.message}`);
        }
      } else {
        console.log(`   ⚠️ Video not found in timeline`);
      }
    }
    
    // Check recent video history for this display
    console.log(`\n📚 Recent Video History:`);
    const historyStmt = db.prepare(`
      SELECT vh.*, pb.search_term
      FROM video_history vh
      JOIN playlist_blocks pb ON vh.block_id = pb.id
      WHERE vh.display_id = ?
      ORDER BY vh.played_at DESC
      LIMIT 5
    `);
    const recentHistory = historyStmt.all(displayId);
    
    if (recentHistory.length > 0) {
      recentHistory.forEach((entry, index) => {
        console.log(`   ${index + 1}. Video ${entry.video_id} from "${entry.search_term}" (${entry.played_at})`);
      });
    } else {
      console.log(`   No recent video history found`);
    }
    
    console.log(`\n💡 Audio Troubleshooting Tips:`);
    console.log(`   1. Check if is_muted is true in the database`);
    console.log(`   2. Check if the video file itself has audio`);
    console.log(`   3. Check browser/device audio settings`);
    console.log(`   4. Check if there are any mute commands queued`);
    console.log(`   5. Check video player component audio settings`);
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error during check:', error);
  }
}

// Get display ID from command line arguments
const displayId = process.argv[2] || 'LVOYMR';
checkAudioSettings(displayId).catch(console.error);
