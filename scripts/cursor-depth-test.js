const https = require('https');
require('dotenv').config();

let allCursors = [];
let allResults = [];

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

    const startTime = Date.now();
    const req = https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = Date.now();
        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: true,
            data: jsonData,
            duration: endTime - startTime,
            timestamp: Date.now(),
            requestInfo: { 
              limit, 
              cursor: cursor ? cursor.substring(0, 30) + '...' : null,
              pathLength: path.length
            }
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

// Analyze time range of posts
function analyzeTimeRange(posts, label, requestTime) {
  if (!posts || posts.length === 0) {
    return { 
      count: 0, 
      newestTime: null, 
      oldestTime: null, 
      timeSpan: 0,
      freshnessSeconds: null,
      ageMinutes: null
    };
  }

  const times = posts.map(item => item.post.posted_at).sort((a, b) => b - a);
  const newestTime = times[0];
  const oldestTime = times[times.length - 1];
  const timeSpan = newestTime - oldestTime;
  const freshnessSeconds = (requestTime / 1000) - newestTime;
  const ageMinutes = ((requestTime / 1000) - oldestTime) / 60;
  
  console.log(`📊 ${label}:`);
  console.log(`   - Count: ${posts.length}`);
  console.log(`   - Newest: ${new Date(newestTime * 1000).toISOString()} (${freshnessSeconds.toFixed(1)}s ago)`);
  console.log(`   - Oldest: ${new Date(oldestTime * 1000).toISOString()} (${ageMinutes.toFixed(1)}min ago)`);
  console.log(`   - Time span: ${(timeSpan / 60).toFixed(1)} minutes`);
  console.log(`   - Posts/minute: ${(posts.length / (timeSpan / 60)).toFixed(1)}`);
  
  return {
    count: posts.length,
    newestTime,
    oldestTime,
    timeSpan,
    freshnessSeconds,
    ageMinutes,
    posts
  };
}

// Decode cursor to see what's inside (if possible)
function analyzeCursor(cursor) {
  if (!cursor) return null;
  
  try {
    // Try to decode base64 cursor
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    console.log(`🔍 Cursor Analysis:`);
    console.log(`   - Length: ${cursor.length} chars`);
    console.log(`   - Decoded preview: ${decoded.substring(0, 200)}...`);
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(decoded);
      console.log(`   - Cursor structure:`, Object.keys(parsed));
      if (parsed.habidex_cursor) {
        console.log(`   - Has habidex_cursor:`, Object.keys(parsed.habidex_cursor));
      }
      return parsed;
    } catch (e) {
      console.log(`   - Not valid JSON`);
    }
  } catch (e) {
    console.log(`🔍 Cursor: ${cursor.substring(0, 50)}... (${cursor.length} chars, not base64)`);
  }
  
  return null;
}

// Test cursor pagination depth
async function testCursorDepth() {
  console.log('🚀 Cursor Depth and Control Test\n');
  
  try {
    // Step 1: Get initial fresh feed
    console.log('📋 Step 1: Get Fresh Feed (baseline)');
    const fresh = await fetchSoraFeed(50);
    const freshAnalysis = analyzeTimeRange(fresh.data.items, 'Fresh Feed', fresh.timestamp);
    
    if (fresh.data.cursor) {
      allCursors.push({
        step: 1,
        cursor: fresh.data.cursor,
        analysis: freshAnalysis
      });
      analyzeCursor(fresh.data.cursor);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Step 2: Follow cursor chain to see how deep we can go
    let currentCursor = fresh.data.cursor;
    let step = 2;
    let totalTimeBack = 0;
    
    while (currentCursor && step <= 10) { // Limit to 10 steps to avoid infinite loop
      console.log(`\n📋 Step ${step}: Following Cursor Chain`);
      
      const cursorResult = await fetchSoraFeed(50, currentCursor);
      const cursorAnalysis = analyzeTimeRange(cursorResult.data.items, `Cursor Step ${step}`, cursorResult.timestamp);
      
      if (cursorAnalysis.count === 0) {
        console.log('❌ No more posts available');
        break;
      }
      
      // Calculate how far back we've gone
      if (freshAnalysis.newestTime && cursorAnalysis.newestTime) {
        const timeBackMinutes = (freshAnalysis.newestTime - cursorAnalysis.newestTime) / 60;
        totalTimeBack = timeBackMinutes;
        console.log(`   ⏰ Time traveled back: ${timeBackMinutes.toFixed(1)} minutes from fresh feed`);
      }
      
      allResults.push({
        step,
        result: cursorResult,
        analysis: cursorAnalysis,
        timeBackMinutes: totalTimeBack
      });
      
      // Check if we got a new cursor
      if (cursorResult.data.cursor) {
        allCursors.push({
          step,
          cursor: cursorResult.data.cursor,
          analysis: cursorAnalysis
        });
        
        // Check if cursor changed
        if (cursorResult.data.cursor === currentCursor) {
          console.log('⚠️  Cursor unchanged - might be at end');
          break;
        }
        
        currentCursor = cursorResult.data.cursor;
      } else {
        console.log('❌ No cursor in response - end of pagination');
        break;
      }
      
      step++;
      
      // Small delay to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 CURSOR DEPTH ANALYSIS');
    console.log('='.repeat(60));
    
    console.log(`\n🔢 Pagination Summary:`);
    console.log(`   - Total steps: ${allResults.length + 1} (including fresh)`);
    console.log(`   - Total posts retrieved: ${freshAnalysis.count + allResults.reduce((sum, r) => sum + r.analysis.count, 0)}`);
    console.log(`   - Maximum time back: ${totalTimeBack.toFixed(1)} minutes`);
    console.log(`   - Cursors collected: ${allCursors.length}`);
    
    // Analyze time gaps between cursor steps
    console.log(`\n⏱️  Time Progression:`);
    let previousTime = freshAnalysis.newestTime;
    
    allResults.forEach((result, index) => {
      if (result.analysis.newestTime && previousTime) {
        const gap = previousTime - result.analysis.newestTime;
        console.log(`   Step ${result.step}: ${gap.toFixed(1)}s gap, covers ${result.analysis.timeSpan.toFixed(1)}s span`);
        previousTime = result.analysis.oldestTime;
      }
    });
    
    // Test specific cursor manipulation
    console.log('\n' + '='.repeat(60));
    console.log('🔧 CURSOR CONTROL TESTING');
    console.log('='.repeat(60));
    
    // Test if we can use an older cursor to get more recent data
    if (allCursors.length >= 2) {
      console.log(`\n🔄 Testing Cursor Reuse:`);
      
      // Wait a bit for new content
      console.log('   ⏳ Waiting 5 seconds for new content...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get fresh feed again
      const freshNow = await fetchSoraFeed(20);
      const freshNowAnalysis = analyzeTimeRange(freshNow.data.items, 'Fresh Feed (Now)', freshNow.timestamp);
      
      // Try using the first cursor we collected
      console.log(`\n   🔄 Reusing cursor from Step 1:`);
      const reusedResult = await fetchSoraFeed(20, allCursors[0].cursor);
      const reusedAnalysis = analyzeTimeRange(reusedResult.data.items, 'Reused Cursor', reusedResult.timestamp);
      
      // Compare what we get
      if (freshNowAnalysis.newestTime && reusedAnalysis.newestTime) {
        const timeDiff = freshNowAnalysis.newestTime - reusedAnalysis.newestTime;
        console.log(`   📊 Time difference: Fresh is ${timeDiff.toFixed(1)}s newer than reused cursor`);
        
        if (timeDiff > 0) {
          console.log(`   ✅ Fresh feed gives newer content (as expected)`);
        } else {
          console.log(`   🤔 Unexpected: Reused cursor gives newer/same content`);
        }
      }
    }
    
    // Test backfill scenario
    console.log('\n' + '='.repeat(60));
    console.log('🔧 BACKFILL SCENARIO TESTING');
    console.log('='.repeat(60));
    
    console.log(`\n🎯 Simulating Gap Detection and Backfill:`);
    
    // Simulate we detected a gap from 2 minutes ago to 1 minute ago
    const now = Date.now() / 1000;
    const gapStart = now - 120; // 2 minutes ago
    const gapEnd = now - 60;    // 1 minute ago
    
    console.log(`   - Gap period: ${new Date(gapStart * 1000).toISOString()} to ${new Date(gapEnd * 1000).toISOString()}`);
    
    // Check if any of our cursor results could fill this gap
    let canFillGap = false;
    allResults.forEach(result => {
      if (result.analysis.newestTime && result.analysis.oldestTime) {
        const coversGapStart = result.analysis.newestTime >= gapStart && result.analysis.oldestTime <= gapStart;
        const coversGapEnd = result.analysis.newestTime >= gapEnd && result.analysis.oldestTime <= gapEnd;
        const spansGap = result.analysis.newestTime >= gapEnd && result.analysis.oldestTime <= gapStart;
        
        if (coversGapStart || coversGapEnd || spansGap) {
          console.log(`   ✅ Step ${result.step} cursor could help fill gap`);
          console.log(`      - Covers: ${new Date(result.analysis.oldestTime * 1000).toISOString()} to ${new Date(result.analysis.newestTime * 1000).toISOString()}`);
          canFillGap = true;
        }
      }
    });
    
    if (!canFillGap) {
      console.log(`   ❌ No cursor results can fill the simulated gap`);
      console.log(`   💡 This suggests cursor backfill has limited utility for recent gaps`);
    }
    
    // Final recommendations
    console.log('\n' + '='.repeat(60));
    console.log('🎯 CURSOR BACKFILL VIABILITY');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Key Findings:`);
    console.log(`   - Cursor pagination depth: ${totalTimeBack.toFixed(1)} minutes`);
    console.log(`   - Cursor direction: Backwards in time only`);
    console.log(`   - Gap filling capability: ${canFillGap ? 'Limited' : 'Not viable for recent gaps'}`);
    
    console.log(`\n💡 Recommendations:`);
    if (totalTimeBack > 10) {
      console.log(`   ✅ Cursors can go back ${totalTimeBack.toFixed(1)} minutes - useful for historical data`);
      console.log(`   ⚠️  But not suitable for filling small gaps (< 1 minute)`);
      console.log(`   🎯 Better strategy: Reduce polling interval to prevent gaps`);
    } else {
      console.log(`   ❌ Limited cursor depth (${totalTimeBack.toFixed(1)} minutes)`);
      console.log(`   🎯 Cursor backfill not viable - focus on overlap-based polling`);
    }
    
    console.log(`\n🔧 Implementation Strategy:`);
    console.log(`   1. Primary: Fresh polling with sufficient overlap (15-25%)`);
    console.log(`   2. Secondary: Cursor pagination for historical data collection`);
    console.log(`   3. Gap prevention: Adjust polling frequency based on overlap metrics`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the cursor depth test
testCursorDepth();
