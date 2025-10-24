#!/usr/bin/env node

/**
 * Debug script to check format filtering issues
 * This script helps identify why tall videos are appearing in wide format playlists
 */

const { getClient } = require('../src/lib/db.ts');
const { QueueManager } = require('../src/lib/queue-manager.ts');

async function debugFormatFiltering() {
  console.log('🔍 Format Filtering Debug Tool');
  console.log('===============================\n');

  const client = await getClient();
  
  try {
    // Check the database schema for video dimensions
    console.log('📊 Checking database schema...');
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'sora_posts' 
      AND column_name IN ('width', 'height')
      ORDER BY column_name
    `;
    const schemaResult = await client.query(schemaQuery);
    console.log('Video dimension columns:');
    schemaResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    console.log('');

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

    // Test the actual QueueManager searchVideos function
    console.log('\n\n🔧 Testing QueueManager.searchVideos function...');
    console.log('─'.repeat(50));
    
    try {
      const wideResults = await QueueManager.searchVideos('commercial', 5, 'newest', 'wide', []);
      console.log(`QueueManager.searchVideos('commercial', 5, 'newest', 'wide'): Found ${wideResults.length} videos`);
      wideResults.forEach((video, index) => {
        const attachment = video.post.attachments[0];
        const width = attachment?.width || 'unknown';
        const height = attachment?.height || 'unknown';
        const format = width > height ? 'WIDE' : height > width ? 'TALL' : 'SQUARE';
        console.log(`  ${index + 1}. @${video.profile.username} - ${width}x${height} (${format})`);
        console.log(`     "${(video.post.text || '').substring(0, 60)}..."`);
      });
    } catch (error) {
      console.log(`❌ Error testing QueueManager: ${error.message}`);
    }
    
  } finally {
    client.release();
  }
}

debugFormatFiltering().catch(console.error);
