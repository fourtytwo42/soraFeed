#!/usr/bin/env node

/**
 * Database Export Script
 * Exports all data from the PostgreSQL database to JSON files
 * Can be used to migrate data to another server
 * Uses streaming to handle large tables
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

const EXPORT_DIR = path.join(__dirname, '..', 'database-export');
const BATCH_SIZE = 1000; // Export in batches to avoid memory issues

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

async function exportTableStreaming(tableName) {
  console.log(`\n📊 Exporting table: ${tableName}...`);
  
  try {
    // First get total count
    const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
    const totalRows = parseInt(countResult.rows[0].count);
    
    if (totalRows === 0) {
      console.log(`⚠️ Table ${tableName} is empty`);
      const filePath = path.join(EXPORT_DIR, `${tableName}.json`);
      fs.writeFileSync(filePath, JSON.stringify([], null, 2));
      return 0;
    }
    
    const filePath = path.join(EXPORT_DIR, `${tableName}.json`);
    const writeStream = fs.createWriteStream(filePath);
    
    writeStream.write('[\n');
    
    let exportedRows = 0;
    let offset = 0;
    
    while (offset < totalRows) {
      const result = await pool.query(
        `SELECT * FROM ${tableName} ORDER BY 1 LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
      );
      
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        const isLast = (offset + i === totalRows - 1);
        
        if (exportedRows > 0) {
          writeStream.write(',\n');
        }
        
        writeStream.write('  ' + JSON.stringify(row));
        exportedRows++;
      }
      
      offset += BATCH_SIZE;
      
      // Progress indicator
      const progress = Math.round((exportedRows / totalRows) * 100);
      process.stdout.write(`\r   Progress: ${exportedRows}/${totalRows} (${progress}%)`);
    }
    
    writeStream.write('\n]');
    writeStream.end();
    
    console.log(`\n✅ Exported ${exportedRows} rows from ${tableName}`);
    return exportedRows;
  } catch (error) {
    console.error(`❌ Error exporting ${tableName}:`, error.message);
    return 0;
  }
}

async function exportSchema() {
  console.log('\n📋 Exporting database schema...');
  
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    // Get schema for each table
    const schemaInfo = {};
    
    for (const tableName of tables) {
      const columnsResult = await pool.query(`
        SELECT 
          column_name, 
          data_type, 
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      schemaInfo[tableName] = columnsResult.rows;
    }
    
    const schemaPath = path.join(EXPORT_DIR, 'schema.json');
    fs.writeFileSync(schemaPath, JSON.stringify(schemaInfo, null, 2));
    
    console.log(`✅ Exported schema for ${tables.length} tables`);
    return tables;
  } catch (error) {
    console.error('❌ Error exporting schema:', error.message);
    return [];
  }
}

async function exportDatabase() {
  console.log('🚀 Starting Database Export...');
  console.log(`📁 Export directory: ${EXPORT_DIR}`);
  
  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');
    
    // Export schema first
    const tables = await exportSchema();
    
    if (tables.length === 0) {
      console.log('⚠️ No tables found to export');
      return;
    }
    
    // Export each table with streaming
    let totalRows = 0;
    for (const tableName of tables) {
      const rowCount = await exportTableStreaming(tableName);
      totalRows += rowCount;
    }
    
    // Create metadata file
    const metadata = {
      exportDate: new Date().toISOString(),
      database: process.env.DB_NAME || 'sora_feed',
      tables: tables.length,
      totalRows: totalRows,
      version: '1.0.0',
      note: 'Exported using streaming to handle large datasets'
    };
    
    const metadataPath = path.join(EXPORT_DIR, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    console.log('\n✅ Export Complete!');
    console.log(`📊 Exported ${tables.length} tables with ${totalRows} total rows`);
    console.log(`📁 Files saved to: ${EXPORT_DIR}`);
    console.log('\n💡 To transfer to another server:');
    console.log(`   tar -czf database-export.tar.gz database-export/`);
    console.log(`   scp database-export.tar.gz user@server:/path/to/soraFeed/`);
    
  } catch (error) {
    console.error('\n❌ Export failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run export
exportDatabase().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
