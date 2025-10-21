#!/usr/bin/env node

/**
 * Test script to determine the minimal authentication required for Sora API
 * Since we're only fetching public video lists, we might not need all cookies
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SORA_BASE_URL = 'https://sora.chatgpt.com/backend/project_y';

// Test different authentication combinations
const authCombinations = [
  {
    name: 'Bearer Token Only',
    headers: {
      'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Referer': 'https://sora.chatgpt.com/',
    }
  },
  {
    name: 'Bearer Token + Basic Cookies (no session)',
    headers: {
      'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Referer': 'https://sora.chatgpt.com/',
      'Cookie': [
        process.env.CF_CLEARANCE ? `cf_clearance=${process.env.CF_CLEARANCE}` : null,
        process.env.CF_BM ? `__cf_bm=${process.env.CF_BM}` : null,
        process.env.OAI_DID ? `oai-did=${process.env.OAI_DID}` : null,
      ].filter(Boolean).join('; ')
    }
  },
  {
    name: 'Bearer Token + Session Cookie Only',
    headers: {
      'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Referer': 'https://sora.chatgpt.com/',
      'Cookie': `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`
    }
  },
  {
    name: 'Full Authentication (Current Implementation)',
    headers: {
      'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Referer': 'https://sora.chatgpt.com/',
      'Cookie': [
        `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
        process.env.CF_CLEARANCE ? `cf_clearance=${process.env.CF_CLEARANCE}` : null,
        process.env.CF_BM ? `__cf_bm=${process.env.CF_BM}` : null,
        process.env.OAI_SC ? `oai-sc=${process.env.OAI_SC}` : null,
        process.env.OAI_DID ? `oai-did=${process.env.OAI_DID}` : null,
      ].filter(Boolean).join('; ')
    }
  }
];

// Endpoints to test
const endpointsToTest = [
  {
    name: 'Latest Feed',
    url: `${SORA_BASE_URL}/feed?limit=5&cut=nf2_latest`,
  },
  {
    name: 'Top Feed', 
    url: `${SORA_BASE_URL}/feed?limit=5&cut=nf2_top`,
  }
];

async function testAuthCombination(url, headers, authName, endpointName) {
  try {
    console.log(`\n🔍 Testing: ${endpointName} with ${authName}`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.status === 200) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const data = await response.json();
          console.log(`   ✅ SUCCESS! Got ${data.items?.length || 0} videos`);
          
          if (data.items && data.items.length > 0) {
            const firstItem = data.items[0];
            console.log(`   📹 First video: "${firstItem.post?.text?.substring(0, 40) || 'No title'}..."`);
            console.log(`   👤 By: ${firstItem.profile?.display_name || firstItem.profile?.username || 'Unknown'}`);
            console.log(`   🎬 Has video URL: ${!!firstItem.post?.attachments?.[0]?.encodings?.md?.path}`);
          }
          
          return {
            success: true,
            status: response.status,
            itemCount: data.items?.length || 0,
            data: data
          };
        } catch (parseError) {
          console.log(`   ❌ Failed to parse JSON: ${parseError.message}`);
        }
      } else {
        const text = await response.text();
        console.log(`   ⚠️  Non-JSON response: ${text.substring(0, 100)}`);
      }
    } else if (response.status === 401) {
      console.log(`   🚫 Unauthorized - Missing or invalid authentication`);
    } else if (response.status === 403) {
      console.log(`   🚫 Forbidden - Likely Cloudflare challenge or insufficient permissions`);
    } else {
      const text = await response.text();
      console.log(`   ❌ Error ${response.status}: ${text.substring(0, 100)}`);
    }

    return {
      success: false,
      status: response.status
    };

  } catch (error) {
    console.log(`   💥 Network error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

async function runMinimalAuthTests() {
  console.log('🧪 Testing minimal authentication requirements for Sora API...\n');
  console.log('🎯 Goal: Determine if we need session cookies for public video lists\n');
  console.log('=' .repeat(80));
  
  // Check if we have the bearer token
  if (!process.env.AUTH_BEARER_TOKEN) {
    console.error('❌ AUTH_BEARER_TOKEN not found in environment variables');
    console.log('💡 Make sure you have a .env file with the bearer token');
    process.exit(1);
  }

  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // Test each endpoint with each auth combination
  for (const endpoint of endpointsToTest) {
    console.log(`\n📡 ENDPOINT: ${endpoint.name}`);
    console.log('-'.repeat(60));
    
    const endpointResults = {
      endpoint: endpoint,
      authTests: []
    };

    for (const authCombo of authCombinations) {
      const result = await testAuthCombination(
        endpoint.url, 
        authCombo.headers, 
        authCombo.name,
        endpoint.name
      );
      
      endpointResults.authTests.push({
        authMethod: authCombo.name,
        result: result
      });

      // Add a small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    results.tests.push(endpointResults);
  }

  // Save detailed results
  const outputFile = path.join(__dirname, 'minimal_auth_test_results.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 MINIMAL AUTH ANALYSIS');
  console.log('='.repeat(80));
  
  let minimalWorkingAuth = null;
  
  results.tests.forEach(test => {
    console.log(`\n📡 ${test.endpoint.name}:`);
    test.authTests.forEach(authTest => {
      const status = authTest.result.success ? '✅' : '❌';
      const statusCode = authTest.result.status || 'ERROR';
      const itemCount = authTest.result.itemCount || 0;
      console.log(`   ${status} ${authTest.authMethod}: ${statusCode}${authTest.result.success ? ` (${itemCount} items)` : ''}`);
      
      // Track the minimal working auth (first successful one in order)
      if (authTest.result.success && !minimalWorkingAuth) {
        minimalWorkingAuth = authTest.authMethod;
      }
    });
  });

  console.log('\n🎯 CONCLUSION:');
  if (minimalWorkingAuth) {
    console.log(`   ✅ Minimal working authentication: "${minimalWorkingAuth}"`);
    
    if (minimalWorkingAuth === 'Bearer Token Only') {
      console.log('   🚀 GREAT NEWS! We only need the Bearer token for public feeds!');
      console.log('   💡 We can remove the session cookie requirement');
      console.log('   🔧 This simplifies user authentication significantly');
    } else if (minimalWorkingAuth === 'Bearer Token + Basic Cookies (no session)') {
      console.log('   👍 We need Bearer token + basic cookies (no session)');
      console.log('   💡 Session cookie is not required for public feeds');
    } else if (minimalWorkingAuth === 'Bearer Token + Session Cookie Only') {
      console.log('   ⚠️  We need both Bearer token and session cookie');
      console.log('   💭 Session cookie is required even for public feeds');
    } else {
      console.log('   📝 Full authentication is required');
    }
  } else {
    console.log('   ❌ No authentication method worked');
    console.log('   🔍 All methods failed - check token validity');
  }

  console.log(`\n💾 Detailed results saved to: ${outputFile}`);
  console.log('\n🏁 Test completed!');
}

// Run the tests
runMinimalAuthTests().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
