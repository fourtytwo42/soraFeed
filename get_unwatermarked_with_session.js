import fetch from 'node-fetch';
import fs from 'fs';

/**
 * This script demonstrates how to download unwatermarked Sora videos
 * using a ChatGPT session token instead of an API key.
 * 
 * The watermark removal websites use this same approach!
 */

async function downloadWithSessionToken(sessionToken) {
    const postId = 's_68f837d601888191a8b3b5f97a88c9e0';
    
    console.log('🔐 Using ChatGPT Session Token');
    console.log('==============================\n');
    
    // The backend endpoint that requires session auth
    const backendUrl = `https://sora.chatgpt.com/backend/project_y/post/${postId}`;
    
    console.log(`Fetching post data from: ${backendUrl}\n`);
    
    try {
        const response = await fetch(backendUrl, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
                'Origin': 'https://sora.chatgpt.com',
                'Referer': `https://sora.chatgpt.com/p/${postId}`
            }
        });
        
        console.log(`Response status: ${response.status}\n`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Successfully fetched post data!\n');
            
            // Look for video URLs in the response
            const attachment = data.post?.attachments?.[0];
            if (attachment) {
                console.log('📹 Video Information:');
                console.log(`   Generation ID: ${attachment.generation_id}`);
                console.log(`   Task ID: ${attachment.task_id}`);
                console.log(`   Resolution: ${attachment.width}x${attachment.height}`);
                console.log(`   Frames: ${attachment.n_frames}\n`);
                
                // Check encodings
                if (attachment.encodings) {
                    console.log('🎬 Available Encodings:');
                    for (const [key, value] of Object.entries(attachment.encodings)) {
                        if (value?.path) {
                            console.log(`   ${key}: ${value.path.substring(0, 80)}...`);
                        }
                    }
                    console.log();
                    
                    // Try to download the 'source' version (might be unwatermarked)
                    if (attachment.encodings.source?.path) {
                        console.log('📥 Downloading source version...');
                        const videoResponse = await fetch(attachment.encodings.source.path);
                        
                        if (videoResponse.ok) {
                            const buffer = Buffer.from(await videoResponse.arrayBuffer());
                            const filename = `session_download_${Date.now()}.mp4`;
                            fs.writeFileSync(filename, buffer);
                            
                            console.log(`✅ Downloaded: ${filename}`);
                            console.log(`   Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n`);
                            
                            // Compare with watermarked version
                            const watermarkedSize = 7608150;
                            if (buffer.length !== watermarkedSize) {
                                console.log('🎯 DIFFERENT SIZE - This might be unwatermarked!');
                                console.log(`   Watermarked: ${(watermarkedSize / 1024 / 1024).toFixed(2)} MB`);
                                console.log(`   This file: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
                            } else {
                                console.log('ℹ️  Same size as watermarked version');
                                console.log('   The watermark might be baked in at generation time');
                            }
                            
                            return true;
                        }
                    }
                }
            }
        } else {
            const errorText = await response.text();
            console.log(`❌ Error: ${response.status}`);
            console.log(errorText.substring(0, 300));
            
            if (response.status === 401) {
                console.log('\n💡 The session token is invalid or expired.');
                console.log('   You need to get a fresh token from your browser.');
            }
        }
    } catch (error) {
        console.log(`❌ Request failed: ${error.message}`);
    }
    
    return false;
}

async function main() {
    console.log('🎯 Unwatermarked Video Downloader');
    console.log('==================================\n');
    
    console.log('📋 HOW TO GET YOUR SESSION TOKEN:');
    console.log('==================================');
    console.log('1. Open https://sora.chatgpt.com in your browser');
    console.log('2. Log in to your ChatGPT account');
    console.log('3. Open Developer Tools (F12)');
    console.log('4. Go to the Network tab');
    console.log('5. Refresh the page');
    console.log('6. Look for a request to "backend" or "project_y"');
    console.log('7. In the request headers, find "Authorization: Bearer ..."');
    console.log('8. Copy the token after "Bearer "\n');
    
    console.log('💡 ALTERNATIVE METHOD:');
    console.log('======================');
    console.log('1. Open Developer Tools (F12)');
    console.log('2. Go to Application/Storage tab');
    console.log('3. Look under Cookies for sora.chatgpt.com');
    console.log('4. Find the session cookie (might be named __Secure-next-auth.session-token)');
    console.log('5. Copy its value\n');
    
    // Check if token was provided as command line argument
    const sessionToken = process.argv[2];
    
    if (!sessionToken) {
        console.log('⚠️  NO SESSION TOKEN PROVIDED');
        console.log('================================\n');
        console.log('Usage: node get_unwatermarked_with_session.js YOUR_SESSION_TOKEN\n');
        console.log('Example:');
        console.log('  node get_unwatermarked_with_session.js eyJhbGc...\n');
        return;
    }
    
    console.log('🚀 Attempting download with provided session token...\n');
    const success = await downloadWithSessionToken(sessionToken);
    
    if (!success) {
        console.log('\n\n🤔 TROUBLESHOOTING:');
        console.log('===================');
        console.log('- Make sure you\'re logged into sora.chatgpt.com');
        console.log('- The session token expires after some time');
        console.log('- You need to be the owner or have access to the video');
        console.log('- The backend API might have rate limits\n');
    }
}

main();
