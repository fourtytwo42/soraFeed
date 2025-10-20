#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

async function debugRemixes() {
  console.log('🔍 Starting remix debugging...\n');

  // Check if we have required env vars
  const requiredVars = [
    'AUTH_BEARER_TOKEN',
    'COOKIE_SESSION',
    'CF_CLEARANCE',
    'USER_AGENT',
    'CF_BM',
    'OAI_SC',
    'OAI_DID',
    'ACCEPT_LANGUAGE'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ Missing environment variables:', missingVars);
    return;
  }

  const cookieHeader = [
    `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
    `cf_clearance=${process.env.CF_CLEARANCE}`,
    `__cf_bm=${process.env.CF_BM}`,
    `oai-sc=${process.env.OAI_SC}`,
    `oai-did=${process.env.OAI_DID}`,
  ].filter(Boolean).join('; ');

  const headers = {
    'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
    'Accept': '*/*',
    'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
    'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0',
    'Cookie': cookieHeader,
  };

  try {
    // 1. Fetch top videos
    console.log('📡 Fetching top videos...');
    const feedResponse = await fetch('https://sora.chatgpt.com/backend/project_y/feed?limit=5&cut=nf2_top', {
      headers: {
        ...headers,
        'Referer': 'https://sora.chatgpt.com/',
      }
    });

    if (!feedResponse.ok) {
      console.error('❌ Failed to fetch feed:', feedResponse.status, feedResponse.statusText);
      return;
    }

    const feedData = await feedResponse.json();
    console.log(`✅ Fetched ${feedData.items?.length || 0} videos\n`);

    // 2. Analyze each video and its remixes
    for (let i = 0; i < Math.min(3, feedData.items?.length || 0); i++) {
      const video = feedData.items[i];
      console.log(`\n🎥 Video ${i + 1}: ${video.post.id}`);
      console.log(`   Title: ${video.post.text?.substring(0, 50) || 'No title'}...`);
      
      // Analyze original video URLs
      console.log('\n📹 Original Video URLs:');
      if (video.post.attachments && video.post.attachments[0]) {
        const attachment = video.post.attachments[0];
        console.log('   Encodings available:', Object.keys(attachment.encodings || {}));
        
        if (attachment.encodings?.md?.path) {
          console.log('   MD path:', attachment.encodings.md.path);
        }
        if (attachment.encodings?.source?.path) {
          console.log('   Source path:', attachment.encodings.source.path);
        }
        if (attachment.encodings?.thumbnail?.path) {
          console.log('   Thumbnail:', attachment.encodings.thumbnail.path);
        }
      }

      // 3. Fetch remixes for this video
      console.log('\n🔄 Fetching remixes...');
      const remixResponse = await fetch(`https://sora.chatgpt.com/backend/project_y/post/${video.post.id}/tree?limit=5&max_depth=1`, {
        headers: {
          ...headers,
          'Referer': `https://sora.chatgpt.com/p/${video.post.id}`,
        }
      });

      if (!remixResponse.ok) {
        console.error(`   ❌ Failed to fetch remixes: ${remixResponse.status}`);
        continue;
      }

      const remixData = await remixResponse.json();
      const remixCount = remixData.children?.items?.length || 0;
      console.log(`   ✅ Found ${remixCount} remixes`);

      // 4. Analyze remix video URLs
      if (remixCount > 0) {
        console.log('\n🎬 Remix Analysis:');
        for (let j = 0; j < Math.min(3, remixCount); j++) {
          const remix = remixData.children.items[j];
          console.log(`\n   Remix ${j + 1}: ${remix.post.id}`);
          console.log(`   Title: ${remix.post.text?.substring(0, 40) || 'No title'}...`);
          
          if (remix.post.attachments && remix.post.attachments[0]) {
            const attachment = remix.post.attachments[0];
            console.log('   Encodings available:', Object.keys(attachment.encodings || {}));
            
            if (attachment.encodings?.md?.path) {
              console.log('   MD path:', attachment.encodings.md.path);
              
              // Test if the URL is accessible
              try {
                const testResponse = await fetch(attachment.encodings.md.path, { method: 'HEAD' });
                console.log(`   MD URL test: ${testResponse.ok ? '✅ Accessible' : '❌ Not accessible'} (${testResponse.status})`);
              } catch (error) {
                console.log(`   MD URL test: ❌ Error - ${error.message}`);
              }
            }
            
            if (attachment.encodings?.source?.path) {
              console.log('   Source path:', attachment.encodings.source.path);
              
              // Test if the URL is accessible
              try {
                const testResponse = await fetch(attachment.encodings.source.path, { method: 'HEAD' });
                console.log(`   Source URL test: ${testResponse.ok ? '✅ Accessible' : '❌ Not accessible'} (${testResponse.status})`);
              } catch (error) {
                console.log(`   Source URL test: ❌ Error - ${error.message}`);
              }
            }
          } else {
            console.log('   ❌ No attachments found for this remix');
          }
        }
      }

      console.log('\n' + '='.repeat(80));
    }

    // 5. Save debug data to file
    const debugData = {
      timestamp: new Date().toISOString(),
      feedData: feedData,
      analysis: 'Check console output for detailed analysis'
    };

    fs.writeFileSync('debug_remix_data.json', JSON.stringify(debugData, null, 2));
    console.log('\n💾 Debug data saved to debug_remix_data.json');

  } catch (error) {
    console.error('🚨 Error during debugging:', error);
  }
}

// Run the debug script
debugRemixes().catch(console.error);
