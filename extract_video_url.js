import fetch from 'node-fetch';
import fs from 'fs';

async function downloadVideoFromChatGPT() {
    const videoId = 's_68f837d601888191a8b3b5f97a88c9e0';
    
    console.log('🎯 FOUND THE VIDEO! Extracting download URL from ChatGPT response...');
    
    // From the HTML response, I found the direct video URL:
    const directVideoUrl = 'https://videos.openai.com/az/files/00000000-63d8-6283-9fb5-097112eb1312%2Fraw?se=2025-10-28T01%3A46%3A00Z&sp=r&sv=2024-08-04&sr=b&skoid=b4ab33b8-2ad4-40af-8ed0-a2b350b6603c&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2025-10-22T01%3A32%3A54Z&ske=2025-10-29T01%3A37%3A54Z&sks=b&skv=2024-08-04&sig=7J9jtjhkvqtQ9s1ZT5o1IbXrIp/HVcqgL8HpdMZ1r9E%3D&ac=oaisdsorprwestus2';
    
    console.log('Direct video URL found:', directVideoUrl);
    
    try {
        console.log('Downloading video...');
        const response = await fetch(directVideoUrl);
        
        console.log(`Response status: ${response.status}`);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const filename = `back_to_future_2025_trailer_${videoId}.mp4`;
            fs.writeFileSync(filename, buffer);
            
            console.log(`✅ SUCCESS! Downloaded video: ${filename}`);
            console.log(`File size: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
            
            // Also download the thumbnail
            const thumbnailUrl = 'https://videos.openai.com/az/files/86c2a6008085fcc_00000000-63d8-6283-9fb5-097112eb1312%2Fdrvs%2Fthumbnail%2Fraw?se=2025-10-28T01%3A46%3A00Z&sp=r&sv=2024-08-04&sr=b&skoid=b4ab33b8-2ad4-40af-8ed0-a2b350b6603c&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2025-10-22T01%3A32%3A54Z&ske=2025-10-29T01%3A37%3A54Z&sks=b&skv=2024-08-04&sig=S7Tyok4Y4RIsaNKlBCAXDz0z/2v6Xhu8F44aVA7Ri/Y%3D&ac=oaisdsorprwestus2';
            
            console.log('Downloading thumbnail...');
            const thumbResponse = await fetch(thumbnailUrl);
            if (thumbResponse.ok) {
                const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
                const thumbFilename = `thumbnail_${videoId}.jpg`;
                fs.writeFileSync(thumbFilename, thumbBuffer);
                console.log(`✅ Downloaded thumbnail: ${thumbFilename}`);
            }
            
            return true;
        } else {
            const errorText = await response.text();
            console.log(`❌ Download failed: ${response.status} - ${errorText}`);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error downloading video:', error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 Video Downloader - Direct URL Method');
    console.log('=====================================');
    
    const success = await downloadVideoFromChatGPT();
    
    if (success) {
        console.log('\n🎉 MISSION ACCOMPLISHED!');
        console.log('The video has been successfully downloaded.');
        console.log('');
        console.log('📋 WHAT WE LEARNED:');
        console.log('- The video ID s_68f837d601888191a8b3b5f97a88c9e0 is from ChatGPT Sora web interface');
        console.log('- It\'s NOT an API video ID (those start with "video_")');
        console.log('- The video is publicly accessible via direct URLs');
        console.log('- The URLs are signed Azure blob storage URLs with expiration dates');
        console.log('- Video details: 352x640 resolution, 450 frames, "Back to the Future 2025" trailer');
    } else {
        console.log('\n❌ Download failed. The URLs might have expired.');
        console.log('Try accessing the video through the web browser at:');
        console.log('https://sora.chatgpt.com/p/s_68f837d601888191a8b3b5f97a88c9e0');
    }
}

main();
