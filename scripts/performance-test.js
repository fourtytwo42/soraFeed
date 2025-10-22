const https = require('https');
require('dotenv').config();

// Test configuration
const TEST_LIMITS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
const TESTS_PER_LIMIT = 3; // Run multiple tests per limit for accuracy
const TIMEOUT_MS = 45000; // 45 second timeout
const DELAY_BETWEEN_TESTS = 2000; // 2 seconds between tests

// Results storage
const results = [];

// Fetch feed from Sora API
function fetchSoraFeed(limit) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const options = {
      hostname: 'sora.chatgpt.com',
      path: `/backend/project_y/feed?limit=${limit}&cut=nf2_latest`,
      method: 'GET',
      timeout: TIMEOUT_MS,
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

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        try {
          const jsonData = JSON.parse(data);
          const postCount = jsonData.items?.length || 0;
          
          resolve({
            success: true,
            limit,
            duration,
            postCount,
            postsPerSecond: postCount / (duration / 1000),
            efficiency: postCount / duration, // posts per millisecond
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          reject({
            success: false,
            limit,
            duration,
            error: `JSON parse error: ${error.message}`,
            timestamp: new Date().toISOString()
          });
        }
      });
    });

    req.on('error', (error) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      reject({
        success: false,
        limit,
        duration,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const endTime = Date.now();
      const duration = endTime - startTime;
      reject({
        success: false,
        limit,
        duration,
        error: 'Request timeout',
        timestamp: new Date().toISOString()
      });
    });

    // Set a manual timeout as backup
    const timeoutId = setTimeout(() => {
      req.destroy();
      const endTime = Date.now();
      const duration = endTime - startTime;
      reject({
        success: false,
        limit,
        duration,
        error: 'Manual timeout',
        timestamp: new Date().toISOString()
      });
    }, TIMEOUT_MS);

    req.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

// Run performance test for a specific limit
async function testLimit(limit, testNumber) {
  console.log(`🧪 Testing limit ${limit} (test ${testNumber}/${TESTS_PER_LIMIT})...`);
  
  try {
    const result = await fetchSoraFeed(limit);
    
    if (result.success) {
      console.log(`   ✅ ${result.postCount} posts in ${result.duration}ms (${result.postsPerSecond.toFixed(1)} p/s)`);
      return result;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      return result;
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.error || error.message}`);
    return error;
  }
}

// Analyze results and find optimal batch size
function analyzeResults() {
  console.log('\n📊 PERFORMANCE ANALYSIS');
  console.log('=' .repeat(80));
  
  // Group results by limit
  const groupedResults = {};
  results.forEach(result => {
    if (!groupedResults[result.limit]) {
      groupedResults[result.limit] = [];
    }
    groupedResults[result.limit].push(result);
  });
  
  // Calculate statistics for each limit
  const stats = [];
  
  for (const [limit, limitResults] of Object.entries(groupedResults)) {
    const successfulResults = limitResults.filter(r => r.success);
    const failedResults = limitResults.filter(r => !r.success);
    
    if (successfulResults.length === 0) {
      stats.push({
        limit: parseInt(limit),
        successRate: 0,
        avgDuration: null,
        avgPostCount: null,
        avgPostsPerSecond: null,
        avgEfficiency: null,
        reliability: 'FAILED'
      });
      continue;
    }
    
    const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
    const avgPostCount = successfulResults.reduce((sum, r) => sum + r.postCount, 0) / successfulResults.length;
    const avgPostsPerSecond = successfulResults.reduce((sum, r) => sum + r.postsPerSecond, 0) / successfulResults.length;
    const avgEfficiency = successfulResults.reduce((sum, r) => sum + r.efficiency, 0) / successfulResults.length;
    const successRate = (successfulResults.length / limitResults.length) * 100;
    
    let reliability = 'EXCELLENT';
    if (successRate < 100) reliability = 'GOOD';
    if (successRate < 80) reliability = 'POOR';
    if (successRate < 50) reliability = 'UNRELIABLE';
    
    stats.push({
      limit: parseInt(limit),
      successRate,
      avgDuration,
      avgPostCount,
      avgPostsPerSecond,
      avgEfficiency,
      reliability,
      failedCount: failedResults.length
    });
  }
  
  // Sort by limit
  stats.sort((a, b) => a.limit - b.limit);
  
  // Print detailed results
  console.log('\nLimit | Success | Avg Duration | Avg Posts | Posts/Sec | Efficiency | Reliability');
  console.log('-'.repeat(80));
  
  stats.forEach(stat => {
    if (stat.successRate === 0) {
      console.log(`${stat.limit.toString().padStart(5)} | ${stat.successRate.toFixed(0).padStart(7)}% | ${'FAILED'.padStart(12)} | ${'FAILED'.padStart(9)} | ${'FAILED'.padStart(9)} | ${'FAILED'.padStart(10)} | ${stat.reliability}`);
    } else {
      console.log(`${stat.limit.toString().padStart(5)} | ${stat.successRate.toFixed(0).padStart(7)}% | ${(stat.avgDuration/1000).toFixed(1).padStart(9)}s | ${stat.avgPostCount.toFixed(0).padStart(9)} | ${stat.avgPostsPerSecond.toFixed(1).padStart(9)} | ${(stat.avgEfficiency*1000).toFixed(2).padStart(10)} | ${stat.reliability}`);
    }
  });
  
  // Find optimal batch size
  const reliableStats = stats.filter(s => s.successRate >= 90 && s.avgDuration);
  
  if (reliableStats.length === 0) {
    console.log('\n❌ No reliable batch sizes found!');
    return null;
  }
  
  // Find the sweet spot: highest efficiency with good reliability
  const optimal = reliableStats.reduce((best, current) => {
    // Prefer higher efficiency, but penalize very long durations
    const currentScore = current.avgEfficiency * (current.avgDuration < 20000 ? 1 : 0.5);
    const bestScore = best.avgEfficiency * (best.avgDuration < 20000 ? 1 : 0.5);
    return currentScore > bestScore ? current : best;
  });
  
  console.log('\n🎯 OPTIMAL BATCH SIZE RECOMMENDATION:');
  console.log(`   Limit: ${optimal.limit} posts`);
  console.log(`   Average Duration: ${(optimal.avgDuration/1000).toFixed(1)}s`);
  console.log(`   Average Posts Retrieved: ${optimal.avgPostCount.toFixed(0)}`);
  console.log(`   Speed: ${optimal.avgPostsPerSecond.toFixed(1)} posts/second`);
  console.log(`   Success Rate: ${optimal.successRate.toFixed(0)}%`);
  console.log(`   Reliability: ${optimal.reliability}`);
  
  // Calculate recommended polling interval for 30% overlap
  const recommendedInterval = Math.max(8, Math.ceil(optimal.avgDuration / 1000) + 2);
  console.log(`\n⏰ RECOMMENDED POLLING STRATEGY:`);
  console.log(`   Batch Size: ${optimal.limit} posts`);
  console.log(`   Poll Interval: ${recommendedInterval} seconds`);
  console.log(`   Expected Overlap: ~30-40% (ensures no missed posts)`);
  
  return {
    optimalLimit: optimal.limit,
    avgDuration: optimal.avgDuration,
    recommendedInterval: recommendedInterval,
    stats: optimal
  };
}

// Main test function
async function runPerformanceTest() {
  console.log('🚀 Sora API Performance Test Starting...');
  console.log(`📊 Testing limits: ${TEST_LIMITS.join(', ')}`);
  console.log(`🔄 ${TESTS_PER_LIMIT} tests per limit`);
  console.log(`⏱️  Timeout: ${TIMEOUT_MS/1000}s\n`);
  
  const totalTests = TEST_LIMITS.length * TESTS_PER_LIMIT;
  let completedTests = 0;
  
  for (const limit of TEST_LIMITS) {
    console.log(`\n📈 Testing batch size: ${limit}`);
    
    for (let testNum = 1; testNum <= TESTS_PER_LIMIT; testNum++) {
      const result = await testLimit(limit, testNum);
      results.push(result);
      
      completedTests++;
      const progress = ((completedTests / totalTests) * 100).toFixed(1);
      console.log(`   Progress: ${progress}% (${completedTests}/${totalTests})`);
      
      // Delay between tests to avoid rate limiting
      if (completedTests < totalTests) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS));
      }
    }
  }
  
  console.log('\n✅ All tests completed!');
  
  // Analyze and display results
  const analysis = analyzeResults();
  
  // Save results to file
  const fs = require('fs');
  const resultsFile = `performance-test-results-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify({
    testConfig: {
      limits: TEST_LIMITS,
      testsPerLimit: TESTS_PER_LIMIT,
      timeout: TIMEOUT_MS
    },
    results,
    analysis,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`\n💾 Results saved to: ${resultsFile}`);
  
  return analysis;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  if (results.length > 0) {
    console.log('📊 Analyzing partial results...');
    analyzeResults();
  }
  process.exit(0);
});

// Start the test
runPerformanceTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
