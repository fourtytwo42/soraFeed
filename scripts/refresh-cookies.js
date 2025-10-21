#!/usr/bin/env node

/**
 * Cookie Refresh Script
 * Automatically refreshes Cloudflare cookies by making a browser-like request
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const COOKIE_FILE = path.join(__dirname, '..', '.cookies.json');

// Function to make a request and extract cookies
function refreshCookies() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sora.chatgpt.com',
      path: '/backend/project_y/feed?limit=5&cut=nf2_latest',
      method: 'GET',
      headers: {
        'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Referer': 'https://sora.chatgpt.com/explore'
      }
    };

    const req = https.get(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // Extract cookies from response headers
        const cookies = {};
        const setCookieHeaders = res.headers['set-cookie'] || [];
        
        setCookieHeaders.forEach(cookie => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          if (name && value) {
            cookies[name.trim()] = value.trim();
          }
        });

        console.log('🍪 Extracted cookies:', Object.keys(cookies));
        resolve(cookies);
      });
    });

    req.on('error', (error) => {
      console.error('❌ Cookie refresh failed:', error.message);
      reject(error);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Cookie refresh timeout'));
    });
  });
}

// Function to update .env file with new cookies
function updateEnvFile(cookies) {
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Update cookie values
  const cookieMappings = {
    'CF_CLEARANCE': 'cf_clearance',
    'CF_BM': '__cf_bm',
    'OAI_SC': 'oai-sc',
    'OAI_DID': 'oai-did'
  };

  Object.entries(cookieMappings).forEach(([envVar, cookieName]) => {
    if (cookies[cookieName]) {
      const regex = new RegExp(`^${envVar}=.*$`, 'm');
      const replacement = `${envVar}=${cookies[cookieName]}`;
      
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, replacement);
      } else {
        envContent += `\n${replacement}`;
      }
      
      console.log(`✅ Updated ${envVar}`);
    }
  });

  fs.writeFileSync(envPath, envContent);
  console.log('📝 Updated .env file with new cookies');
}

// Function to save cookies to file for backup
function saveCookiesToFile(cookies) {
  const cookieData = {
    timestamp: new Date().toISOString(),
    cookies: cookies
  };
  
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookieData, null, 2));
  console.log('💾 Saved cookies to .cookies.json');
}

// Main function
async function main() {
  try {
    console.log('🔄 Refreshing Cloudflare cookies...');
    
    const cookies = await refreshCookies();
    
    if (Object.keys(cookies).length === 0) {
      console.log('⚠️  No cookies extracted, using existing ones');
      return;
    }
    
    // Update .env file
    updateEnvFile(cookies);
    
    // Save backup
    saveCookiesToFile(cookies);
    
    console.log('✅ Cookie refresh completed successfully');
    
  } catch (error) {
    console.error('❌ Cookie refresh failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { refreshCookies, updateEnvFile };
