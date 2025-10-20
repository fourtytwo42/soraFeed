#!/usr/bin/env node

// Script to extract credentials from Raw-API-call.md and create .env file
const fs = require('fs');
const path = require('path');

const rawApiFile = path.join(__dirname, '..', 'Raw-API-call.md');
const envFile = path.join(__dirname, '..', '.env');

try {
  const content = fs.readFileSync(rawApiFile, 'utf8');
  
  // Extract bearer token
  const bearerMatch = content.match(/Bearer\s+([^\s\n]+)/);
  const bearerToken = bearerMatch ? bearerMatch[1] : '';
  
  // Extract cookies from the long cookie line
  const cookieMatch = content.match(/cookie\n([^|]+)/);
  const cookieLine = cookieMatch ? cookieMatch[1] : '';
  
  // Extract specific cookie values
  const sessionMatch = cookieLine.match(/__Secure-next-auth\.session-token=([^;]+)/);
  const cfClearanceMatch = cookieLine.match(/cf_clearance=([^;]+)/);
  const cfBmMatch = cookieLine.match(/__cf_bm=([^;]+)/);
  const oaiScMatch = cookieLine.match(/oai-sc=([^;]+)/);
  const oaiDidMatch = cookieLine.match(/oai-did=([^;]+)/);
  
  // Extract user agent
  const userAgentMatch = content.match(/user-agent\n([^|]+)/);
  const userAgent = userAgentMatch ? userAgentMatch[1].trim() : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  
  const envContent = `# Authentication
AUTH_BEARER_TOKEN=${bearerToken}

# Cookies
COOKIE_SESSION=${sessionMatch ? sessionMatch[1] : ''}
CF_CLEARANCE=${cfClearanceMatch ? cfClearanceMatch[1] : ''}
CF_BM=${cfBmMatch ? cfBmMatch[1] : ''}
OAI_SC=${oaiScMatch ? oaiScMatch[1] : ''}
OAI_DID=${oaiDidMatch ? oaiDidMatch[1] : ''}

# Headers
USER_AGENT=${userAgent}
ACCEPT_LANGUAGE=en-US,en;q=0.9

# API Config
FEED_LIMIT=16
FEED_CUT=nf2_latest
`;

  fs.writeFileSync(envFile, envContent);
  console.log('✅ .env file created successfully');
  console.log('🔑 Extracted credentials:');
  console.log(`   Bearer Token: ${bearerToken.substring(0, 50)}...`);
  console.log(`   Session Token: ${sessionMatch ? sessionMatch[1].substring(0, 50) + '...' : 'NOT FOUND'}`);
  console.log(`   CF Clearance: ${cfClearanceMatch ? cfClearanceMatch[1].substring(0, 50) + '...' : 'NOT FOUND'}`);
  console.log(`   OAI DID: ${oaiDidMatch ? oaiDidMatch[1] : 'NOT FOUND'}`);
  
} catch (error) {
  console.error('❌ Error extracting credentials:', error.message);
  process.exit(1);
}
