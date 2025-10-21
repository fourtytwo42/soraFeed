const https = require('https');
require('dotenv').config();

console.log('🔍 Testing Sora API connection...\n');

const options = {
  hostname: 'sora.chatgpt.com',
  path: '/backend/project_y/feed?limit=10&cut=nf2_latest',
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
    'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0',
    'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9'
  }
};

https.get(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  console.log('\nResponse:');
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const jsonData = JSON.parse(data);
      console.log('✅ Valid JSON received');
      console.log('Items count:', jsonData.items?.length || 0);
      console.log('Has cursor:', !!jsonData.cursor);
      
      if (jsonData.items && jsonData.items.length > 0) {
        console.log('\n📄 First post sample:');
        console.log('ID:', jsonData.items[0].post.id);
        console.log('Text:', jsonData.items[0].post.text?.substring(0, 50) || 'No text');
        console.log('Profile:', jsonData.items[0].profile.username);
      } else {
        console.log('\n⚠️  No items in response');
        console.log('Full response:', JSON.stringify(jsonData, null, 2));
      }
    } catch (error) {
      console.error('❌ JSON parse error:', error.message);
      console.log('Raw data (first 500 chars):', data.substring(0, 500));
    }
  });
}).on('error', (error) => {
  console.error('❌ Request error:', error.message);
});
