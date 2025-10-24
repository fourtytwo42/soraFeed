#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

function checkTableSchema() {
  console.log('🔍 Database Table Schema Check');
  console.log('==============================\n');

  try {
    const dbPath = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db = new Database(dbPath);
    
    // Check video_history table schema
    console.log('📋 video_history table schema:');
    const schema = db.prepare("PRAGMA table_info(video_history)").all();
    schema.forEach(column => {
      console.log(`   ${column.name}: ${column.type} ${column.notnull ? 'NOT NULL' : ''} ${column.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    console.log('\n📋 timeline_videos table schema:');
    const timelineSchema = db.prepare("PRAGMA table_info(timeline_videos)").all();
    timelineSchema.forEach(column => {
      console.log(`   ${column.name}: ${column.type} ${column.notnull ? 'NOT NULL' : ''} ${column.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    console.log('\n📋 playlist_blocks table schema:');
    const blocksSchema = db.prepare("PRAGMA table_info(playlist_blocks)").all();
    blocksSchema.forEach(column => {
      console.log(`   ${column.name}: ${column.type} ${column.notnull ? 'NOT NULL' : ''} ${column.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTableSchema();
