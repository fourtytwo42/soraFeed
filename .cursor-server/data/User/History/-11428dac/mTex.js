#!/usr/bin/env node

/**
 * Test script to check if Sora API endpoints work without authentication
 * This would allow us to build a public feed viewer without requiring user tokens
 */

const fs = require('fs');
const path = require('path');

const SORA_BASE_URL = 'https://sora.chatgpt.com/backend/project_y';

// Test different combinations of headers to see what's minimal required
const headerCombinations = [
  {
    name: 'No headers (completely anonymous)',
    headers: {}
  },
  {
    name: 'Basic browser headers only',
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Referer': 'https://sora.chatgpt.com/',
    }
  },
  {
    name: 'Browser headers + Accept-Encoding',
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Referer': 'https://sora.chatgpt.com/',
    }
  },
  {
    name: 'Browser headers + Cache-Control',
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Referer': 'https://sora.chatgpt.com/',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  }
];

// Endpoints to test
const endpointsToTest = [
  {
    name: 'Latest Feed',
    url: `${SORA_BASE_URL}/feed?limit=16&cut=nf2_latest`,
    description: 'Main feed with latest videos'
  },
  {
    name: 'Top Feed', 
    url: `${SORA_BASE_URL}/feed?limit=16&cut=nf2_top`,
    description: 'Top/trending videos feed'
  },
  {
    name: 'Basic Feed (nf2)',
    url: `${SORA_BASE_URL}/feed?limit=16&cut=nf2`,
    description: 'Basic feed endpoint'
  },
  {
    name: 'Feed without cut parameter',
    url: `${SORA_BASE_URL}/feed?limit=16`,
    description: 'Feed without specifying cut type'
  },
  {
    name: 'Minimal feed request',
    url: `${SORA_BASE_URL}/feed`,
    description: 'Feed with no parameters'
  }
];

async function testEndpoint(url, headers, headerName, endpointName) {
  try {
    console.log(`\n🔍 Testing: ${endpointName} with ${headerName}`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      // Don't follow redirects to see what happens
      redirect: 'manual'
    });

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers: ${JSON.stringify(responseHeaders, null, 2)}`);

    if (response.status === 200) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const data = await response.json();
          console.log(`   ✅ SUCCESS! Got JSON data with ${data.items?.length || 0} items`);
          
          // Log first item structure if available
          if (data.items && data.items.length > 0) {
            const firstItem = data.items[0];
            console.log(`   📹 First video: ${firstItem.post?.text?.substring(0, 50) || 'No title'}...`);
            console.log(`   🎬 Video URL: ${firstItem.post?.attachments?.[0]?.encodings?.md?.path || 'No video URL'}`);
          }
          
          return {
            success: true,
            status: response.status,
            data: data,
            headers: responseHeaders
          };
        } catch (parseError) {
          console.log(`   ❌ Failed to parse JSON: ${parseError.message}`);
          const text = await response.text();
          console.log(`   Response text (first 200 chars): ${text.substring(0, 200)}`);
        }
      } else {
        const text = await response.text();
        console.log(`   ⚠️  Non-JSON response: ${text.substring(0, 200)}`);
      }
    } else if (response.status === 403) {
      console.log(`   🚫 Forbidden - Authentication required`);
    } else if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location');
      console.log(`   🔄 Redirect to: ${location}`);
    } else {
      const text = await response.text();
      console.log(`   ❌ Error response: ${text.substring(0, 200)}`);
    }

    return {
      success: false,
      status: response.status,
      headers: responseHeaders
    };

  } catch (error) {
    console.log(`   💥 Network error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('🚀 Testing Sora API endpoints without authentication...\n');
  console.log('=' .repeat(80));
  
  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // Test each endpoint with each header combination
  for (const endpoint of endpointsToTest) {
    console.log(`\n📡 ENDPOINT: ${endpoint.name}`);
    console.log(`📝 Description: ${endpoint.description}`);
    console.log('-'.repeat(60));
    
    const endpointResults = {
      endpoint: endpoint,
      headerTests: []
    };

    for (const headerCombo of headerCombinations) {
      const result = await testEndpoint(
        endpoint.url, 
        headerCombo.headers, 
        headerCombo.name,
        endpoint.name
      );
      
      endpointResults.headerTests.push({
        headerCombo: headerCombo.name,
        result: result
      });

      // Add a small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    results.tests.push(endpointResults);
  }

  // Save detailed results
  const outputFile = path.join(__dirname, 'unauthenticated_test_results.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  
  let successfulCombinations = [];
  
  results.tests.forEach(test => {
    console.log(`\n📡 ${test.endpoint.name}:`);
    test.headerTests.forEach(headerTest => {
      const status = headerTest.result.success ? '✅' : '❌';
      const statusCode = headerTest.result.status || 'ERROR';
      console.log(`   ${status} ${headerTest.headerCombo}: ${statusCode}`);
      
      if (headerTest.result.success) {
        successfulCombinations.push({
          endpoint: test.endpoint.name,
          headers: headerTest.headerCombo,
          itemCount: headerTest.result.data?.items?.length || 0
        });
      }
    });
  });

  if (successfulCombinations.length > 0) {
    console.log('\n🎉 SUCCESSFUL COMBINATIONS:');
    successfulCombinations.forEach(combo => {
      console.log(`   ✅ ${combo.endpoint} with "${combo.headers}" (${combo.itemCount} items)`);
    });
    
    console.log('\n💡 RECOMMENDATION:');
    if (successfulCombinations.length > 0) {
      console.log('   🚀 We can potentially build a public feed without authentication!');
      console.log('   📝 Use the minimal working header combination for production.');
    }
  } else {
    console.log('\n😞 NO SUCCESSFUL COMBINATIONS FOUND');
    console.log('   🔐 All endpoints require authentication');
    console.log('   💭 We\'ll need to stick with user-provided API keys or tokens');
  }

  console.log(`\n💾 Detailed results saved to: ${outputFile}`);
  console.log('\n🏁 Test completed!');
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
