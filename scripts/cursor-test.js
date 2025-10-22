const https = require('https');
require('dotenv').config();

// Test configuration
const TEST_SCENARIOS = [
  { name: "Fresh Feed (no cursor)", limit: 4, cursor: null },
  { name: "Small Batch Fresh", limit: 10, cursor: null },
  { name: "Medium Batch Fresh", limit: 50, cursor: null },
  { name: "Large Batch Fresh", limit: 200, cursor: null }
];

let savedCursor = null;

// Fetch feed from Sora API
function fetchSoraFeed(limit, cursor = null) {
  return new Promise((resolve, reject) => {
    let path = `/backend/project_y/feed?limit=${limit}&cut=nf2_latest`;
    if (cursor) {
      path = `/backend/project_y/feed?cursor=${encodeURIComponent(cursor)}&limit=${limit}&cut=nf2_latest`;
    }
    
    const options = {
      hostname: 'sora.chatgpt.com',
      path: path,
      method: 'GET',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'User-Agent': process.env.USER_AGENT || 'SoraFeedScanner/1.0',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
        'Cookie': [
          `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
          `cf_clearance=${process.env.CF_CLEARANCE}`,
          `__cf_bm=${process.env.CF_BM}`,
          `oai-sc=${process.env.OAI_SC}`,
          `oai-did=${process.env.OAI_DID}`
        ].filter(Boolean).join('; ')
      }
    };

    console.log(`🔍 Request: ${path}`);

    const req = https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: true,
            data: jsonData,
            requestInfo: { limit, cursor: cursor ? cursor.substring(0, 20) + '...' : null }
          });
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Analyze post timestamps and IDs
function analyzePosts(posts, label) {
  if (!posts || posts.length === 0) {
    console.log(`   ❌ No posts in ${label}`);
    return { oldestTime: null, newestTime: null, ids: [] };
  }

  const times = posts.map(item => item.post.posted_at).sort((a, b) => b - a); // Newest first
  const ids = posts.map(item => item.post.id);
  
  const newestTime = times[0];
  const oldestTime = times[times.length - 1];
  const newestDate = new Date(newestTime * 1000);
  const oldestDate = new Date(oldestTime * 1000);
  
  console.log(`   📊 ${label}:`);
  console.log(`      - Count: ${posts.length}`);
  console.log(`      - Newest: ${newestDate.toISOString()} (${newestTime})`);
  console.log(`      - Oldest: ${oldestDate.toISOString()} (${oldestTime})`);
  console.log(`      - Time span: ${((newestTime - oldestTime) / 3600).toFixed(1)} hours`);
  console.log(`      - First ID: ${ids[0]}`);
  console.log(`      - Last ID: ${ids[ids.length - 1]}`);
  
  return { oldestTime, newestTime, ids, posts };
}

// Compare two sets of posts
function comparePosts(posts1, posts2, label1, label2) {
  console.log(`\n🔄 Comparing ${label1} vs ${label2}:`);
  
  const ids1 = new Set(posts1.map(item => item.post.id));
  const ids2 = new Set(posts2.map(item => item.post.id));
  
  const overlap = [...ids1].filter(id => ids2.has(id));
  const unique1 = [...ids1].filter(id => !ids2.has(id));
  const unique2 = [...ids2].filter(id => !ids1.has(id));
  
  console.log(`   - Overlap: ${overlap.length} posts`);
  console.log(`   - Unique to ${label1}: ${unique1.length} posts`);
  console.log(`   - Unique to ${label2}: ${unique2.length} posts`);
  
  if (unique2.length > 0) {
    const uniquePosts2 = posts2.filter(item => unique2.includes(item.post.id));
    const times = uniquePosts2.map(item => item.post.posted_at).sort((a, b) => b - a);
    if (times.length > 0) {
      const newest = new Date(times[0] * 1000);
      const oldest = new Date(times[times.length - 1] * 1000);
      console.log(`   - ${label2} unique posts time range: ${oldest.toISOString()} to ${newest.toISOString()}`);
    }
  }
  
  return { overlap: overlap.length, unique1: unique1.length, unique2: unique2.length };
}

// Test cursor behavior
async function testCursorBehavior() {
  console.log('🚀 Sora API Cursor Behavior Test\n');
  
  try {
    // Test 1: Get initial batch
    console.log('📋 Test 1: Initial Fresh Feed');
    const initial = await fetchSoraFeed(10);
    const initialAnalysis = analyzePosts(initial.data.items, 'Initial Feed');
    savedCursor = initial.data.cursor;
    
    if (savedCursor) {
      console.log(`   🔗 Cursor received: ${savedCursor.substring(0, 50)}...`);
    } else {
      console.log(`   ❌ No cursor in response`);
    }
    
    // Wait a moment
    console.log('\n⏳ Waiting 3 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: Get another fresh batch (no cursor)
    console.log('📋 Test 2: Second Fresh Feed (no cursor)');
    const fresh2 = await fetchSoraFeed(10);
    const fresh2Analysis = analyzePosts(fresh2.data.items, 'Second Fresh Feed');
    
    // Compare initial vs second fresh
    comparePosts(initial.data.items, fresh2.data.items, 'Initial', 'Second Fresh');
    
    // Test 3: Use cursor from first request
    if (savedCursor) {
      console.log('\n📋 Test 3: Using Cursor from First Request');
      const cursorFeed = await fetchSoraFeed(10, savedCursor);
      const cursorAnalysis = analyzePosts(cursorFeed.data.items, 'Cursor Feed');
      
      // Compare fresh vs cursor
      comparePosts(fresh2.data.items, cursorFeed.data.items, 'Fresh Feed', 'Cursor Feed');
      
      // Check if cursor gives older or newer content
      if (cursorAnalysis.newestTime && fresh2Analysis.newestTime) {
        const timeDiff = cursorAnalysis.newestTime - fresh2Analysis.newestTime;
        console.log(`\n⏱️  Time Analysis:`);
        console.log(`   - Cursor feed newest: ${new Date(cursorAnalysis.newestTime * 1000).toISOString()}`);
        console.log(`   - Fresh feed newest: ${new Date(fresh2Analysis.newestTime * 1000).toISOString()}`);
        console.log(`   - Time difference: ${(timeDiff / 3600).toFixed(2)} hours`);
        
        if (timeDiff > 0) {
          console.log(`   ✅ Cursor gives NEWER content (+${(timeDiff / 3600).toFixed(2)}h)`);
        } else if (timeDiff < 0) {
          console.log(`   📜 Cursor gives OLDER content (${(timeDiff / 3600).toFixed(2)}h)`);
        } else {
          console.log(`   🔄 Cursor gives SAME timeframe`);
        }
      }
    }
    
    // Test 4: Different batch sizes
    console.log('\n📋 Test 4: Different Batch Sizes');
    const sizes = [4, 20, 50, 100];
    const sizeResults = [];
    
    for (const size of sizes) {
      const result = await fetchSoraFeed(size);
      const analysis = analyzePosts(result.data.items, `Size ${size}`);
      sizeResults.push({ size, count: result.data.items?.length || 0, analysis });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between requests
    }
    
    // Test 5: Rapid polling to see freshness
    console.log('\n📋 Test 5: Rapid Polling Test (freshness check)');
    const rapidResults = [];
    
    for (let i = 0; i < 3; i++) {
      console.log(`   Poll ${i + 1}/3...`);
      const result = await fetchSoraFeed(5);
      const analysis = analyzePosts(result.data.items, `Poll ${i + 1}`);
      rapidResults.push({ poll: i + 1, analysis, items: result.data.items });
      
      if (i < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      }
    }
    
    // Compare rapid polls
    for (let i = 1; i < rapidResults.length; i++) {
      comparePosts(
        rapidResults[i-1].items, 
        rapidResults[i].items, 
        `Poll ${i}`, 
        `Poll ${i+1}`
      );
    }
    
    // Final recommendations
    console.log('\n🎯 ANALYSIS & RECOMMENDATIONS:');
    console.log('=' .repeat(60));
    
    console.log('\n📊 Key Findings:');
    console.log(`   - API consistently returns ~${sizeResults.find(r => r.size === 200)?.count || 'N/A'} posts when requesting 200`);
    console.log(`   - Cursor behavior: ${savedCursor ? 'Available' : 'Not available'}`);
    
    if (rapidResults.length >= 2) {
      const overlapCount = comparePosts(rapidResults[0].items, rapidResults[1].items, 'Poll1', 'Poll2').overlap;
      const overlapPercent = (overlapCount / Math.min(rapidResults[0].items.length, rapidResults[1].items.length)) * 100;
      console.log(`   - Rapid polling overlap: ${overlapPercent.toFixed(1)}%`);
    }
    
    console.log('\n🏆 BEST PRACTICE RECOMMENDATIONS:');
    
    if (savedCursor) {
      console.log('   1. CURSOR-BASED PAGINATION:');
      console.log('      - Use cursor for getting older content (pagination)');
      console.log('      - Fresh requests (no cursor) for latest content');
      console.log('      - Hybrid approach: fresh + cursor for comprehensive coverage');
    }
    
    console.log('   2. OPTIMAL POLLING STRATEGY:');
    console.log('      - Batch size: 50-100 posts (good balance of speed vs completeness)');
    console.log('      - Polling frequency: Based on overlap analysis');
    console.log('      - Always use fresh requests for latest content');
    
    console.log('   3. IMPLEMENTATION:');
    console.log('      - Primary: Fresh polling for new content');
    console.log('      - Secondary: Cursor-based backfill for missed content');
    console.log('      - Monitor overlap to adjust timing');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testCursorBehavior();
