const https = require('https');
require('dotenv').config();

// Test realistic scanner behavior
const REALISTIC_BATCH_SIZE = 200;
const REALISTIC_INTERVAL = 10000; // 10 seconds
let testResults = [];

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
              cursor: cursor ? cursor.substring(0, 20) + '...' : null,
              path: path.length > 100 ? path.substring(0, 100) + '...' : path
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

// Analyze posts with detailed timing
function analyzePosts(posts, label, requestTime) {
  if (!posts || posts.length === 0) {
    console.log(`   ❌ No posts in ${label}`);
    return { oldestTime: null, newestTime: null, ids: [], timeSpan: 0 };
  }

  const times = posts.map(item => item.post.posted_at).sort((a, b) => b - a); // Newest first
  const ids = posts.map(item => item.post.id);
  
  const newestTime = times[0];
  const oldestTime = times[times.length - 1];
  const timeSpan = newestTime - oldestTime;
  const newestDate = new Date(newestTime * 1000);
  const oldestDate = new Date(oldestTime * 1000);
  const requestDate = new Date(requestTime);
  
  // Calculate how fresh the newest post is
  const freshnessSeconds = (requestTime / 1000) - newestTime;
  
  console.log(`   📊 ${label}:`);
  console.log(`      - Count: ${posts.length}`);
  console.log(`      - Newest: ${newestDate.toISOString()} (${freshnessSeconds.toFixed(1)}s ago)`);
  console.log(`      - Oldest: ${oldestDate.toISOString()}`);
  console.log(`      - Time span: ${(timeSpan / 60).toFixed(1)} minutes`);
  console.log(`      - Rate: ${(posts.length / (timeSpan / 60)).toFixed(1)} posts/minute`);
  console.log(`      - First ID: ${ids[0]}`);
  console.log(`      - Last ID: ${ids[ids.length - 1]}`);
  
  return { 
    oldestTime, 
    newestTime, 
    ids, 
    timeSpan, 
    posts,
    freshnessSeconds,
    postsPerMinute: posts.length / (timeSpan / 60)
  };
}

// Compare two sets of posts with detailed analysis
function comparePosts(posts1, posts2, label1, label2, time1, time2) {
  console.log(`\n🔄 Comparing ${label1} vs ${label2}:`);
  
  const ids1 = new Set(posts1.map(item => item.post.id));
  const ids2 = new Set(posts2.map(item => item.post.id));
  
  const overlap = [...ids1].filter(id => ids2.has(id));
  const unique1 = [...ids1].filter(id => !ids2.has(id));
  const unique2 = [...ids2].filter(id => !ids1.has(id));
  
  const overlapPercent = (overlap.length / Math.min(posts1.length, posts2.length)) * 100;
  const timeBetweenRequests = (time2 - time1) / 1000;
  
  console.log(`   - Time between requests: ${timeBetweenRequests.toFixed(1)} seconds`);
  console.log(`   - Overlap: ${overlap.length} posts (${overlapPercent.toFixed(1)}%)`);
  console.log(`   - Unique to ${label1}: ${unique1.length} posts`);
  console.log(`   - Unique to ${label2}: ${unique2.length} posts`);
  
  // Analyze the gap between batches
  if (unique1.length > 0 && unique2.length > 0) {
    const unique1Posts = posts1.filter(item => unique1.includes(item.post.id));
    const unique2Posts = posts2.filter(item => unique2.includes(item.post.id));
    
    const oldest1 = Math.min(...unique1Posts.map(item => item.post.posted_at));
    const newest1 = Math.max(...unique1Posts.map(item => item.post.posted_at));
    const oldest2 = Math.min(...unique2Posts.map(item => item.post.posted_at));
    const newest2 = Math.max(...unique2Posts.map(item => item.post.posted_at));
    
    const gap = oldest2 - newest1;
    console.log(`   - Time gap between batches: ${gap.toFixed(1)} seconds`);
    
    if (gap > 0) {
      console.log(`   ⚠️  POTENTIAL MISSING CONTENT: ${gap.toFixed(1)}s gap detected!`);
      return { overlapPercent, gap, missingContent: true };
    } else if (gap < 0) {
      console.log(`   ✅ Good overlap: ${Math.abs(gap).toFixed(1)}s overlap`);
      return { overlapPercent, gap, missingContent: false };
    }
  }
  
  return { overlapPercent, gap: 0, missingContent: false };
}

// Test cursor backfill strategy
async function testCursorBackfill(lastCursor, gapStart, gapEnd) {
  console.log(`\n🔧 Testing Cursor Backfill Strategy:`);
  console.log(`   - Gap period: ${new Date(gapStart * 1000).toISOString()} to ${new Date(gapEnd * 1000).toISOString()}`);
  console.log(`   - Gap duration: ${(gapEnd - gapStart).toFixed(1)} seconds`);
  
  if (!lastCursor) {
    console.log(`   ❌ No cursor available for backfill`);
    return null;
  }
  
  try {
    // Try using the cursor to get older content
    const cursorResult = await fetchSoraFeed(100, lastCursor);
    const cursorAnalysis = analyzePosts(cursorResult.data.items, 'Cursor Backfill', cursorResult.timestamp);
    
    // Check if cursor content fills the gap
    if (cursorAnalysis.posts && cursorAnalysis.posts.length > 0) {
      const cursorTimes = cursorAnalysis.posts.map(item => item.post.posted_at);
      const cursorNewest = Math.max(...cursorTimes);
      const cursorOldest = Math.min(...cursorTimes);
      
      console.log(`   📊 Cursor content time range: ${new Date(cursorOldest * 1000).toISOString()} to ${new Date(cursorNewest * 1000).toISOString()}`);
      
      // Check if cursor helps fill the gap
      const fillsGap = cursorNewest >= gapStart && cursorOldest <= gapEnd;
      console.log(`   ${fillsGap ? '✅' : '❌'} Cursor ${fillsGap ? 'helps fill' : 'does not fill'} the gap`);
      
      return { cursorAnalysis, fillsGap, cursorResult };
    }
  } catch (error) {
    console.log(`   ❌ Cursor backfill failed: ${error.message}`);
  }
  
  return null;
}

// Main realistic test
async function runRealisticTest() {
  console.log('🚀 Realistic Sora Scanner Behavior Test');
  console.log(`📊 Testing: ${REALISTIC_BATCH_SIZE} posts every ${REALISTIC_INTERVAL/1000} seconds\n`);
  
  try {
    // Simulate 3 realistic scanner polls
    const polls = [];
    
    for (let i = 0; i < 3; i++) {
      console.log(`📋 Poll ${i + 1}/3: Fetching ${REALISTIC_BATCH_SIZE} posts...`);
      
      const result = await fetchSoraFeed(REALISTIC_BATCH_SIZE);
      const analysis = analyzePosts(result.data.items, `Poll ${i + 1}`, result.timestamp);
      
      polls.push({
        pollNumber: i + 1,
        result,
        analysis,
        cursor: result.data.cursor
      });
      
      console.log(`      - Duration: ${result.duration}ms`);
      console.log(`      - Cursor: ${result.data.cursor ? 'Available' : 'None'}`);
      
      // Wait realistic interval before next poll (except for last)
      if (i < 2) {
        console.log(`   ⏳ Waiting ${REALISTIC_INTERVAL/1000} seconds...\n`);
        await new Promise(resolve => setTimeout(resolve, REALISTIC_INTERVAL));
      }
    }
    
    // Analyze overlaps between consecutive polls
    console.log('\n' + '='.repeat(60));
    console.log('📊 OVERLAP ANALYSIS');
    console.log('='.repeat(60));
    
    const gaps = [];
    for (let i = 1; i < polls.length; i++) {
      const comparison = comparePosts(
        polls[i-1].result.data.items,
        polls[i].result.data.items,
        `Poll ${i}`,
        `Poll ${i+1}`,
        polls[i-1].result.timestamp,
        polls[i].result.timestamp
      );
      
      if (comparison.missingContent) {
        gaps.push({
          between: `Poll ${i} and Poll ${i+1}`,
          gap: comparison.gap,
          cursor: polls[i-1].cursor
        });
      }
    }
    
    // Test cursor backfill if we found gaps
    if (gaps.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('🔧 CURSOR BACKFILL TESTING');
      console.log('='.repeat(60));
      
      for (const gap of gaps) {
        console.log(`\n🔍 Testing backfill for gap ${gap.between}:`);
        // For this test, we'll use approximate gap times
        const gapStart = Date.now() / 1000 - 30; // Approximate
        const gapEnd = Date.now() / 1000 - 10;   // Approximate
        
        await testCursorBackfill(gap.cursor, gapStart, gapEnd);
      }
    }
    
    // Calculate overall statistics
    console.log('\n' + '='.repeat(60));
    console.log('📈 OVERALL STATISTICS');
    console.log('='.repeat(60));
    
    const totalPosts = polls.reduce((sum, poll) => sum + poll.analysis.ids.length, 0);
    const totalUnique = new Set(polls.flatMap(poll => poll.analysis.ids)).size;
    const totalDuplicates = totalPosts - totalUnique;
    const avgPostsPerMinute = polls.reduce((sum, poll) => sum + (poll.analysis.postsPerMinute || 0), 0) / polls.length;
    
    console.log(`   - Total posts fetched: ${totalPosts}`);
    console.log(`   - Unique posts: ${totalUnique}`);
    console.log(`   - Duplicate posts: ${totalDuplicates}`);
    console.log(`   - Overall overlap: ${((totalDuplicates / totalPosts) * 100).toFixed(1)}%`);
    console.log(`   - Average rate: ${avgPostsPerMinute.toFixed(1)} posts/minute (~${(avgPostsPerMinute/60).toFixed(1)} posts/second)`);
    
    // Recommendations
    console.log('\n' + '='.repeat(60));
    console.log('🎯 RECOMMENDATIONS');
    console.log('='.repeat(60));
    
    const avgOverlap = gaps.length === 0 ? 
      polls.slice(1).reduce((sum, _, i) => {
        const comp = comparePosts(
          polls[i].result.data.items,
          polls[i+1].result.data.items,
          `Poll ${i+1}`,
          `Poll ${i+2}`,
          polls[i].result.timestamp,
          polls[i+1].result.timestamp
        );
        return sum + comp.overlapPercent;
      }, 0) / (polls.length - 1) : 0;
    
    console.log(`\n📊 Current Strategy Analysis:`);
    console.log(`   - Polling interval: ${REALISTIC_INTERVAL/1000}s`);
    console.log(`   - Batch size: ${REALISTIC_BATCH_SIZE} posts`);
    console.log(`   - Average overlap: ${avgOverlap.toFixed(1)}%`);
    console.log(`   - Content gaps detected: ${gaps.length > 0 ? 'YES' : 'NO'}`);
    
    if (avgOverlap < 15) {
      console.log(`\n⚠️  LOW OVERLAP WARNING:`);
      console.log(`   - Current overlap (${avgOverlap.toFixed(1)}%) is below safe threshold (15%)`);
      console.log(`   - Recommendation: Reduce polling interval to 6-8 seconds`);
      console.log(`   - Alternative: Implement cursor-based backfill system`);
    } else if (avgOverlap > 40) {
      console.log(`\n💡 HIGH OVERLAP DETECTED:`);
      console.log(`   - Current overlap (${avgOverlap.toFixed(1)}%) is quite high`);
      console.log(`   - Recommendation: Increase polling interval to 12-15 seconds`);
      console.log(`   - This will improve efficiency without missing content`);
    } else {
      console.log(`\n✅ OPTIMAL OVERLAP:`);
      console.log(`   - Current overlap (${avgOverlap.toFixed(1)}%) is in good range (15-40%)`);
      console.log(`   - Current strategy is working well`);
    }
    
    console.log(`\n🔄 Cursor Strategy:`);
    if (polls[0].cursor) {
      console.log(`   - Cursors are available for pagination`);
      console.log(`   - Cursor can be used for backfill if gaps are detected`);
      console.log(`   - Cursor points to older content (for pagination)`);
      console.log(`   - Fresh requests (no cursor) always get latest content`);
    } else {
      console.log(`   - No cursors available in API responses`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the realistic test
runRealisticTest();
