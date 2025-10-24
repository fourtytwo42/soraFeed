#!/usr/bin/env node

/**
 * Database Import Script
 * Imports data from JSON files into PostgreSQL database
 * Used to migrate data from another server
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

let pg;
try {
  pg = require('pg');
} catch (error) {
  console.error('❌ PostgreSQL module not found. Please run: npm install pg');
  process.exit(1);
}

const { Pool } = pg;

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const IMPORT_DIR = path.join(__dirname, '..', 'database-export');

async function importTable(tableName, data) {
  console.log(`\n📥 Importing table: ${tableName}...`);
  
  if (data.length === 0) {
    console.log(`⚠️ No data to import for ${tableName}`);
    return 0;
  }
  
  try {
    // Get column names from first row
    const columns = Object.keys(data[0]);
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    
    if (!tableCheck.rows[0].exists) {
      console.log(`⚠️ Table ${tableName} does not exist, skipping...`);
      return 0;
    }
    
    // Clear existing data (optional - comment out if you want to merge)
    // await pool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
    // console.log(`🗑️ Cleared existing data from ${tableName}`);
    
    // Prepare INSERT statement
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertQuery = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT DO NOTHING
    `;
    
    // Insert data in batches
    let imported = 0;
    for (const row of data) {
      try {
        const values = columns.map(col => row[col]);
        await pool.query(insertQuery, values);
        imported++;
      } catch (error) {
        // Skip conflicts or errors for individual rows
        if (!error.message.includes('duplicate key')) {
          console.error(`⚠️ Error importing row:`, error.message);
        }
      }
    }
    
    console.log(`✅ Imported ${imported} rows into ${tableName}`);
    return imported;
  } catch (error) {
    console.error(`❌ Error importing ${tableName}:`, error.message);
    return 0;
  }
}

async function importDatabase() {
  console.log('🚀 Starting Database Import...');
  console.log(`📁 Import directory: ${IMPORT_DIR}`);
  
  try {
    // Check if import directory exists
    if (!fs.existsSync(IMPORT_DIR)) {
      console.error(`❌ Import directory not found: ${IMPORT_DIR}`);
      console.log('💡 Please run export-database.js first or copy the database-export folder from the source server');
      process.exit(1);
    }
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');
    
    // Read metadata
    const metadataPath = path.join(IMPORT_DIR, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      console.log('\n📋 Import Metadata:');
      console.log(`   Export Date: ${metadata.exportDate}`);
      console.log(`   Source Database: ${metadata.database}`);
      console.log(`   Tables: ${metadata.tables}`);
      console.log(`   Total Rows: ${metadata.totalRows}`);
    }
    
    // Get all JSON files in export directory
    const files = fs.readdirSync(IMPORT_DIR)
      .filter(file => file.endsWith('.json') && file !== 'metadata.json' && file !== 'schema.json');
    
    if (files.length === 0) {
      console.log('⚠️ No data files found to import');
      return;
    }
    
    // Import each table in order (important for foreign keys)
    const importOrder = [
      'posts.json',
      'playlists.json',
      'blocks.json',
      'block_videos.json',
      'displays.json',
      'display_playlists.json',
      'video_timeline.json'
    ];
    
    let totalImported = 0;
    
    // Import in specific order first
    for (const filename of importOrder) {
      if (files.includes(filename)) {
        const tableName = filename.replace('.json', '');
        const filePath = path.join(IMPORT_DIR, filename);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const imported = await importTable(tableName, data);
        totalImported += imported;
      }
    }
    
    // Import remaining tables
    for (const filename of files) {
      if (!importOrder.includes(filename)) {
        const tableName = filename.replace('.json', '');
        const filePath = path.join(IMPORT_DIR, filename);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const imported = await importTable(tableName, data);
        totalImported += imported;
      }
    }
    
    console.log('\n✅ Import Complete!');
    console.log(`📊 Imported ${totalImported} total rows`);
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run import
importDatabase().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


