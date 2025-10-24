#!/usr/bin/env node

/**
 * Manual Cookie Update Script
 * Run this when you need to update cookies from your browser
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🍪 Manual Cookie Update Script');
console.log('==============================');
console.log('');
console.log('This script will help you update the Cloudflare cookies.');
console.log('Follow these steps:');
console.log('');
console.log('1. Open your browser and go to: https://sora.chatgpt.com/explore');
console.log('2. Open Developer Tools (F12)');
console.log('3. Go to Application/Storage tab');
console.log('4. Click on Cookies > https://sora.chatgpt.com');
console.log('5. Copy the values for these cookies:');
console.log('   - cf_clearance');
console.log('   - __cf_bm');
console.log('   - oai-sc');
console.log('   - oai-did');
console.log('   - __Secure-next-auth.session-token');
console.log('');

function askForCookie(cookieName, description) {
  return new Promise((resolve) => {
    rl.question(`Enter ${cookieName} (${description}): `, (value) => {
      resolve(value.trim());
    });
  });
}

async function updateCookies() {
  try {
    console.log('Please provide the cookie values:');
    console.log('');
    
    const cookies = {};
    
    cookies.cf_clearance = await askForCookie('cf_clearance', 'Cloudflare clearance token');
    cookies.__cf_bm = await askForCookie('__cf_bm', 'Cloudflare bot management token');
    cookies['oai-sc'] = await askForCookie('oai-sc', 'OpenAI session cookie');
    cookies['oai-did'] = await askForCookie('oai-did', 'OpenAI device ID');
    cookies['__Secure-next-auth.session-token'] = await askForCookie('__Secure-next-auth.session-token', 'NextAuth session token');
    
    // Update .env file
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    const cookieMappings = {
      'CF_CLEARANCE': 'cf_clearance',
      'CF_BM': '__cf_bm',
      'OAI_SC': 'oai-sc',
      'OAI_DID': 'oai-did',
      'COOKIE_SESSION': '__Secure-next-auth.session-token'
    };

    let updated = false;
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
        updated = true;
      }
    });

    if (updated) {
      fs.writeFileSync(envPath, envContent);
      console.log('');
      console.log('📝 Updated .env file with new cookies');
      
      // Save backup
      const cookieData = {
        timestamp: new Date().toISOString(),
        cookies: cookies
      };
      
      const cookieFile = path.join(__dirname, '..', '.cookies.json');
      fs.writeFileSync(cookieFile, JSON.stringify(cookieData, null, 2));
      console.log('💾 Saved cookies to .cookies.json');
      
      console.log('');
      console.log('✅ Cookie update completed successfully!');
      console.log('You can now restart the scanner with: npm run scanner');
    } else {
      console.log('❌ No cookies were provided. Update cancelled.');
    }
    
  } catch (error) {
    console.error('❌ Error updating cookies:', error.message);
  } finally {
    rl.close();
  }
}

// Run the script
updateCookies();
