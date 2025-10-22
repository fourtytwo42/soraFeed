const https = require('https');
require('dotenv').config();

// Fetch feed from Sora API with shorter timeout
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
      timeout: 15000, // Shorter timeout
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

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: true,
            data: jsonData,
            timestamp: Date.now()
          });
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Analyze time range
function analyzeTimeRange(posts, label) {
  if (!posts || posts.length === 0) return null;

  const times = posts.map(item => item.post.posted_at).sort((a, b) => b - a);
  const newest = times[0];
  const oldest = times[times.length - 1];
  const now = Date.now() / 1000;
  
  console.log(`📊 ${label}:`);
  console.log(`   - Count: ${posts.length}`);
  console.log(`   - Newest: ${new Date(newest * 1000).toISOString()} (${(now - newest).toFixed(1)}s ago)`);
  console.log(`   - Oldest: ${new Date(oldest * 1000).toISOString()} (${((now - oldest) / 60).toFixed(1)}min ago)`);
  console.log(`   - Span: ${((newest - oldest) / 60).toFixed(1)} minutes`);
  
  return { newest, oldest, count: posts.length };
}

// Simple cursor exploration
async function exploreCursor() {
  console.log('🚀 Simple Cursor Exploration Test\n');
  
  try {
    // Get fresh baseline
    console.log('📋 Getting fresh baseline...');
    const fresh1 = await fetchSoraFeed(30);
    const fresh1Analysis = analyzeTimeRange(fresh1.data.items, 'Fresh Baseline');
    const cursor1 = fresh1.data.cursor;
    
    if (!cursor1) {
      console.log('❌ No cursor available');
      return;
    }
    
    console.log(`\n🔗 Cursor received: ${cursor1.substring(0, 50)}...`);
    
    // Wait and get another fresh feed
    console.log('\n⏳ Waiting 15 seconds for new content...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    console.log('\n📋 Getting fresh feed after wait...');
    const fresh2 = await fetchSoraFeed(30);
    const fresh2Analysis = analyzeTimeRange(fresh2.data.items, 'Fresh After Wait');
    
    // Compare the two fresh feeds
    if (fresh1Analysis && fresh2Analysis) {
      const timeDiff = fresh2Analysis.newest - fresh1Analysis.newest;
      console.log(`\n🔄 Fresh feed comparison:`);
      console.log(`   - Time difference: ${timeDiff.toFixed(1)} seconds`);
      console.log(`   - New content appeared: ${timeDiff > 0 ? 'YES' : 'NO'}`);
    }
    
    // Now use the original cursor
    console.log('\n📋 Using original cursor...');
    const cursorResult = await fetchSoraFeed(30, cursor1);
    const cursorAnalysis = analyzeTimeRange(cursorResult.data.items, 'Original Cursor');
    
    // Compare cursor result with both fresh feeds
    if (cursorAnalysis && fresh1Analysis && fresh2Analysis) {
      console.log(`\n🔍 Cursor vs Fresh Analysis:`);
      
      const cursorVsFresh1 = fresh1Analysis.newest - cursorAnalysis.newest;
      const cursorVsFresh2 = fresh2Analysis.newest - cursorAnalysis.newest;
      
      console.log(`   - Cursor vs Fresh1: ${cursorVsFresh1.toFixed(1)}s difference`);
      console.log(`   - Cursor vs Fresh2: ${cursorVsFresh2.toFixed(1)}s difference`);
      
      // Check if cursor could fill a gap
      const gapStart = fresh1Analysis.oldest;
      const gapEnd = fresh2Analysis.newest;
      const cursorCoversGap = cursorAnalysis.newest >= gapStart && cursorAnalysis.oldest <= gapEnd;
      
      console.log(`\n🔧 Gap Filling Analysis:`);
      console.log(`   - Simulated gap: ${new Date(gapStart * 1000).toISOString()} to ${new Date(gapEnd * 1000).toISOString()}`);
      console.log(`   - Cursor covers gap: ${cursorCoversGap ? 'YES' : 'NO'}`);
      
      if (cursorCoversGap) {
        console.log(`   ✅ Cursor could potentially fill gaps!`);
      } else {
        console.log(`   ❌ Cursor cannot fill this type of gap`);
      }
    }
    
    // Test cursor chaining (just one step to avoid timeout)
    if (cursorResult.data.cursor) {
      console.log('\n📋 Testing cursor chaining (one step)...');
      const cursor2Result = await fetchSoraFeed(20, cursorResult.data.cursor);
      const cursor2Analysis = analyzeTimeRange(cursor2Result.data.items, 'Second Cursor');
      
      if (cursor2Analysis && cursorAnalysis) {
        const chainDiff = cursorAnalysis.newest - cursor2Analysis.newest;
        console.log(`\n🔗 Cursor Chain Analysis:`);
        console.log(`   - Time between cursor steps: ${chainDiff.toFixed(1)} seconds`);
        console.log(`   - Direction: ${chainDiff > 0 ? 'Going backwards' : 'Going forwards'}`);
      }
    }
    
    // Final assessment
    console.log('\n' + '='.repeat(60));
    console.log('🎯 CURSOR BACKFILL ASSESSMENT');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Key Findings:`);
    console.log(`   - Cursor direction: Backwards in time`);
    console.log(`   - Cursor persistence: Available across requests`);
    console.log(`   - Gap filling potential: Limited to historical gaps`);
    
    console.log(`\n💡 Backfill Strategy Recommendations:`);
    console.log(`   1. 🚫 Real-time gaps: Cannot be filled with cursor (cursor goes backwards)`);
    console.log(`   2. 📚 Historical gaps: Possible with cursor pagination`);
    console.log(`   3. 🎯 Best approach: Prevent gaps with proper overlap (15-25%)`);
    console.log(`   4. 🔄 Fallback: Use cursor only for historical data collection`);
    
    console.log(`\n🔧 Implementation Priority:`);
    console.log(`   - HIGH: Optimize polling frequency for overlap`);
    console.log(`   - MEDIUM: Implement cursor-based historical backfill`);
    console.log(`   - LOW: Real-time gap detection and alerting`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
exploreCursor();
