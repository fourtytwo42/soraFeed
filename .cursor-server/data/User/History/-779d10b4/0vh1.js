#!/usr/bin/env node

// Enhanced scanner with detailed logging for development
const { Pool } = require('pg');
const https = require('https');
require('dotenv').config();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log('🔍 DEV SCANNER: Starting with enhanced username logging...');

// Enhanced logging function
function logUserData(action, data) {
  console.log(`👤 DEV SCANNER ${action}:`, {
    timestamp: new Date().toISOString(),
    postId: data.post?.id,
    userId: data.profile?.user_id || data.profile?.id,
    username: data.profile?.username,
    displayName: data.profile?.display_name,
    verified: data.profile?.verified,
    profileData: data.profile
  });
}

// Load and run the original scanner with enhanced logging
const originalScanner = require('./scripts/scanner.js');

console.log('🚀 DEV SCANNER: Enhanced scanner started with username tracking');
