#!/usr/bin/env node

/**
 * Simple debug script to check format filtering issues
 */

const { Pool } = require('pg');
const path = require('path');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || '192.168.50.104',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function debugFormatFiltering() {
  console.log('🔍 Format Filtering Debug Tool');
  console.log('===============================\n');

  const client = await pool.connect();
  
  try {
    // Check for videos with missing dimensions
    console.log('🔍 Checking for videos with missing dimensions...');
    const missingDimsQuery = `
      SELECT COUNT(*) as total_videos,
             COUNT(width) as videos_with_width,
             COUNT(height) as videos_with_height,
             COUNT(CASE WHEN width IS NULL OR height IS NULL THEN 1 END) as videos_missing_dims
      FROM sora_posts
    `;
    const missingDimsResult = await client.query(missingDimsQuery);
    const stats = missingDimsResult.rows[0];
    console.log(`Total videos: ${stats.total_videos}`);
    console.log(`Videos with width: ${stats.videos_with_width}`);
    console.log(`Videos with height: ${stats.videos_with_height}`);
    console.log(`Videos missing dimensions: ${stats.videos_missing_dims}`);
    console.log('');

    // Check dimension ranges
    console.log('📏 Checking dimension ranges...');
    const dimsQuery = `
      SELECT 
        MIN(width) as min_width,
        MAX(width) as max_width,
        MIN(height) as min_height,
        MAX(height) as max_height,
        AVG(width) as avg_width,
        AVG(height) as avg_height
      FROM sora_posts 
      WHERE width IS NOT NULL AND height IS NOT NULL
    `;
    const dimsResult = await client.query(dimsQuery);
    const dims = dimsResult.rows[0];
    console.log(`Width range: ${dims.min_width} - ${dims.max_width} (avg: ${Math.round(dims.avg_width)})`);
    console.log(`Height range: ${dims.min_height} - ${dims.max_height} (avg: ${Math.round(dims.avg_height)})`);
    console.log('');

    // Test format filtering with actual data
    console.log('🎬 Testing format filtering...');
    const testTerms = ['commercial', 'movie trailer'];
    
    for (const term of testTerms) {
      console.log(`\nTesting search term: "${term}"`);
      console.log('─'.repeat(40));
      
      // Test without format filter
      const allQuery = `
        SELECT p.id, p.text, p.width, p.height, c.username,
               CASE 
                 WHEN p.width > p.height THEN 'wide'
                 WHEN p.height > p.width THEN 'tall'
                 WHEN p.width = p.height THEN 'square'
                 ELSE 'unknown'
               END as format_type
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.text ILIKE $1
        ORDER BY p.posted_at DESC
        LIMIT 10
      `;
      const allResult = await client.query(allQuery, [`%${term}%`]);
      
      console.log(`Found ${allResult.rows.length} videos (no format filter):`);
      const formatCounts = { wide: 0, tall: 0, square: 0, unknown: 0 };
      allResult.rows.forEach((row, index) => {
        formatCounts[row.format_type]++;
        if (index < 3) { // Show first 3 for details
          console.log(`  ${index + 1}. @${row.username} - ${row.width}x${row.height} (${row.format_type})`);
          console.log(`     "${(row.text || '').substring(0, 60)}..."`);
        }
      });
      console.log(`  Format breakdown: Wide: ${formatCounts.wide}, Tall: ${formatCounts.tall}, Square: ${formatCounts.square}, Unknown: ${formatCounts.unknown}`);
      
      // Test with wide format filter
      const wideQuery = `
        SELECT p.id, p.text, p.width, p.height, c.username
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.text ILIKE $1 AND p.width > p.height
        ORDER BY p.posted_at DESC
        LIMIT 5
      `;
      const wideResult = await client.query(wideQuery, [`%${term}%`]);
      
      console.log(`\nWith WIDE filter: Found ${wideResult.rows.length} videos`);
      wideResult.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. @${row.username} - ${row.width}x${row.height} (WIDE)`);
        console.log(`     "${(row.text || '').substring(0, 60)}..."`);
      });
      
      // Test with tall format filter
      const tallQuery = `
        SELECT p.id, p.text, p.width, p.height, c.username
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.text ILIKE $1 AND p.height > p.width
        ORDER BY p.posted_at DESC
        LIMIT 5
      `;
      const tallResult = await client.query(tallQuery, [`%${term}%`]);
      
      console.log(`\nWith TALL filter: Found ${tallResult.rows.length} videos`);
      tallResult.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. @${row.username} - ${row.width}x${row.height} (TALL)`);
        console.log(`     "${(row.text || '').substring(0, 60)}..."`);
      });
    }

    // Check for videos that might be incorrectly categorized
    console.log('\n\n🔍 Checking for potential format misclassifications...');
    console.log('─'.repeat(50));
    
    // Look for videos that are close to square (might be misclassified)
    const squareQuery = `
      SELECT p.id, p.text, p.width, p.height, c.username,
             ABS(p.width - p.height) as dimension_diff
      FROM sora_posts p
      JOIN creators c ON p.creator_id = c.id
      WHERE p.text ILIKE '%commercial%' 
        AND p.width IS NOT NULL 
        AND p.height IS NOT NULL
        AND ABS(p.width - p.height) < 100
      ORDER BY ABS(p.width - p.height) ASC
      LIMIT 10
    `;
    const squareResult = await client.query(squareQuery);
    
    console.log(`Found ${squareResult.rows.length} videos that are close to square (dimension diff < 100):`);
    squareResult.rows.forEach((row, index) => {
      const format = row.width > row.height ? 'WIDE' : row.height > row.width ? 'TALL' : 'SQUARE';
      console.log(`  ${index + 1}. @${row.username} - ${row.width}x${row.height} (${format}, diff: ${row.dimension_diff})`);
      console.log(`     "${(row.text || '').substring(0, 60)}..."`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

debugFormatFiltering().catch(console.error);
