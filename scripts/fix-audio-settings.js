#!/usr/bin/env node

/**
 * Script to fix audio/mute settings for displays
 */

const Database = require('better-sqlite3');
const path = require('path');

async function fixAudioSettings(displayId, action = 'unmute') {
  console.log('🔧 Audio Settings Fix Tool');
  console.log('==========================\n');

  if (!displayId) {
    console.log('❌ Please provide a display ID');
    console.log('Usage: node scripts/fix-audio-settings.js <display-id> [mute|unmute]');
    process.exit(1);
  }

  try {
    // Connect to SQLite database
    const dbPath = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db = new Database(dbPath);
    
    console.log(`📺 ${action === 'mute' ? 'Muting' : 'Unmuting'} display: ${displayId}`);
    
    // Get current display info
    const displayStmt = db.prepare('SELECT * FROM displays WHERE id = ?');
    const display = displayStmt.get(displayId);
    
    if (!display) {
      console.log(`❌ Display with ID ${displayId} not found`);
      db.close();
      process.exit(1);
    }
    
    console.log(`\n📊 Current Display Information:`);
    console.log(`   Name: ${display.name}`);
    console.log(`   Status: ${display.status}`);
    console.log(`   Current Audio State: ${display.is_muted ? 'MUTED' : 'UNMUTED'}`);
    console.log(`   Playback State: ${display.playback_state}`);
    console.log(`   Is Playing: ${display.is_playing}`);
    
    // Update the mute setting
    const newMuteValue = action === 'mute' ? 1 : 0;
    const updateStmt = db.prepare(`
      UPDATE displays 
      SET is_muted = ?, last_state_change = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = updateStmt.run(newMuteValue, displayId);
    
    if (result.changes > 0) {
      console.log(`\n✅ Successfully ${action === 'mute' ? 'muted' : 'unmuted'} display ${displayId}`);
      console.log(`   Audio state changed from ${display.is_muted ? 'MUTED' : 'UNMUTED'} to ${newMuteValue ? 'MUTED' : 'UNMUTED'}`);
    } else {
      console.log(`\n⚠️ No changes made to display ${displayId}`);
    }
    
    // Verify the change
    const updatedDisplay = displayStmt.get(displayId);
    console.log(`\n📊 Updated Display Information:`);
    console.log(`   Name: ${updatedDisplay.name}`);
    console.log(`   Status: ${updatedDisplay.status}`);
    console.log(`   Audio State: ${updatedDisplay.is_muted ? 'MUTED' : 'UNMUTED'}`);
    console.log(`   Playback State: ${updatedDisplay.playback_state}`);
    console.log(`   Is Playing: ${updatedDisplay.is_playing}`);
    console.log(`   Last State Change: ${updatedDisplay.last_state_change}`);
    
    // Also send a command to the display to update its audio state
    console.log(`\n📨 Sending audio command to display...`);
    
    // Add a command to the display's command queue
    let commands = [];
    try {
      commands = JSON.parse(updatedDisplay.commands || '[]');
    } catch (e) {
      commands = [];
    }
    
    // Add the audio command
    const audioCommand = {
      type: 'setMuted',
      data: { muted: newMuteValue === 1 },
      timestamp: new Date().toISOString()
    };
    
    commands.push(audioCommand);
    
    const updateCommandsStmt = db.prepare(`
      UPDATE displays 
      SET commands = ?
      WHERE id = ?
    `);
    
    updateCommandsStmt.run(JSON.stringify(commands), displayId);
    
    console.log(`   ✅ Added ${action} command to display queue`);
    console.log(`   Command: ${JSON.stringify(audioCommand)}`);
    
    console.log(`\n🎉 Audio fix completed!`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. The display should receive the audio command on its next poll`);
    console.log(`   2. The video should now have ${action === 'mute' ? 'no' : ''} sound`);
    console.log(`   3. If the issue persists, check the video player component settings`);
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error during fix:', error);
  }
}

// Get display ID and action from command line arguments
const displayId = process.argv[2] || 'LVOYMR';
const action = process.argv[3] || 'unmute';
fixAudioSettings(displayId, action).catch(console.error);
