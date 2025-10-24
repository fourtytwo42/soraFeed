#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

function checkDatabaseStructure() {
  console.log('🔍 Database Structure Check');
  console.log('===========================\n');

  try {
    // Check queue.db
    console.log('📁 Checking data/queue.db:');
    const dbPath1 = path.join(__dirname, '..', 'data', 'queue.db');
    const db1 = new Database(dbPath1);
    
    const tables1 = db1.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`   Tables: ${tables1.map(t => t.name).join(', ')}`);
    
    if (tables1.length > 0) {
      console.log('   Sample data:');
      tables1.forEach(table => {
        const count = db1.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        console.log(`     ${table.name}: ${count.count} rows`);
      });
    }
    
    db1.close();
    
    // Check queue_system.db
    console.log('\n📁 Checking data/queue_system.db:');
    const dbPath2 = path.join(__dirname, '..', 'data', 'queue_system.db');
    const db2 = new Database(dbPath2);
    
    const tables2 = db2.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`   Tables: ${tables2.map(t => t.name).join(', ')}`);
    
    if (tables2.length > 0) {
      console.log('   Sample data:');
      tables2.forEach(table => {
        const count = db2.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        console.log(`     ${table.name}: ${count.count} rows`);
      });
    }
    
    db2.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDatabaseStructure();
