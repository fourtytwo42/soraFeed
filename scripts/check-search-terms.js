#!/usr/bin/env node

/**
 * Quick script to check what videos are being returned for specific search terms
 * This helps identify if search terms are too broad or overlapping
 */

const { getClient } = require('../src/lib/db.ts');

async function checkSearchTerms() {
  console.log('🔍 Checking Search Terms');
  console.log('========================\n');

  const client = await getClient();
  
  try {
    // Test the search terms that might be causing issues
    const testTerms = [
      'commercial',
      'movie trailer', 
      'cartoon',
      'music video',
      'game show',
      'interdimensional cable'
    ];
    
    for (const term of testTerms) {
      console.log(`\n🔍 Testing: "${term}"`);
      console.log('─'.repeat(40));
      
      const query = `
        SELECT 
          p.id, p.text, p.posted_at,
          c.username
        FROM sora_posts p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.text ILIKE $1
        ORDER BY p.posted_at DESC
        LIMIT 5
      `;
      
      const result = await client.query(query, [`%${term}%`]);
      
      console.log(`Found ${result.rows.length} videos:`);
      result.rows.forEach((row, index) => {
        const text = row.text || 'No text';
        console.log(`  ${index + 1}. @${row.username}`);
        console.log(`     "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
        console.log(`     Posted: ${new Date(row.posted_at).toLocaleDateString()}`);
      });
    }
    
    // Check for potential overlaps
    console.log('\n\n🔍 Checking for Potential Overlaps');
    console.log('─'.repeat(40));
    
    const overlapQuery = `
      SELECT 
        p.id, p.text, p.posted_at,
        c.username
      FROM sora_posts p
      JOIN creators c ON p.creator_id = c.id
      WHERE p.text ILIKE '%commercial%' 
        AND p.text ILIKE '%movie%'
      ORDER BY p.posted_at DESC
      LIMIT 5
    `;
    
    const overlapResult = await client.query(overlapQuery);
    console.log(`Videos containing both "commercial" and "movie": ${overlapResult.rows.length}`);
    overlapResult.rows.forEach((row, index) => {
      const text = row.text || 'No text';
      console.log(`  ${index + 1}. @${row.username}`);
      console.log(`     "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    });
    
  } finally {
    client.release();
  }
}

checkSearchTerms().catch(console.error);
