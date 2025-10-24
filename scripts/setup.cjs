#!/usr/bin/env node

const { execSync } = require('child_process');
const { Pool } = require('pg');
const https = require('https');
require('dotenv').config();

async function main() {
console.log('🚀 Sora Feed - Complete Setup');
console.log('==============================\n');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Step 1: Check Node.js and npm
info('Step 1: Checking Node.js and npm...');
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
  const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
  success(`Node.js: ${nodeVersion}`);
  success(`npm: ${npmVersion}`);
} catch (err) {
  error('Node.js or npm not found. Please install Node.js 18+ first.');
  process.exit(1);
}

// Step 2: Check PostgreSQL
info('\nStep 2: Checking PostgreSQL...');
let postgresInstalled = false;
try {
  const pgVersion = execSync('psql --version', { encoding: 'utf-8' }).trim();
  success(`PostgreSQL: ${pgVersion}`);
  postgresInstalled = true;
} catch (err) {
  warning('PostgreSQL not found. Attempting to install...');
  try {
    log('Installing PostgreSQL...', 'cyan');
    execSync('sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib', { stdio: 'inherit' });
    execSync('sudo systemctl start postgresql', { stdio: 'inherit' });
    execSync('sudo systemctl enable postgresql', { stdio: 'inherit' });
    success('PostgreSQL installed and started');
    postgresInstalled = true;
  } catch (installErr) {
    error('Failed to install PostgreSQL. Please install manually:');
    log('  Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib', 'yellow');
    log('  macOS: brew install postgresql', 'yellow');
    process.exit(1);
  }
}

// Step 3: Configure PostgreSQL
info('\nStep 3: Configuring PostgreSQL...');
try {
  // Set postgres password
  execSync(`sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${process.env.DB_PASSWORD || 'postgres'}';"`, { stdio: 'inherit' });
  success('PostgreSQL user configured');
  
  // Create database
  try {
    execSync(`sudo -u postgres createdb ${process.env.DB_NAME || 'sora_feed'}`, { stdio: 'inherit' });
    success(`Database '${process.env.DB_NAME || 'sora_feed'}' created`);
  } catch (dbErr) {
    warning('Database might already exist');
  }
} catch (err) {
  error('Failed to configure PostgreSQL');
  process.exit(1);
}

// Step 4: Test database connection
info('\nStep 4: Testing database connection...');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

try {
  const client = await pool.connect();
  const version = await client.query('SELECT version()');
  success('Database connection successful!');
  log(`  ${version.rows[0].version.split(' ').slice(0, 2).join(' ')}`, 'cyan');
  client.release();
} catch (err) {
  error(`Database connection failed: ${err.message}`);
  process.exit(1);
}

// Step 5: Initialize database tables
info('\nStep 5: Initializing database tables...');
try {
  const client = await pool.connect();
  
  // Create posts table
  await client.query(`
    CREATE TABLE IF NOT EXISTS sora_posts (
      id TEXT PRIMARY KEY,
      post_data JSONB NOT NULL,
      profile_data JSONB NOT NULL,
      text TEXT,
      posted_at BIGINT,
      updated_at BIGINT,
      like_count INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      remix_count INTEGER DEFAULT 0,
      permalink TEXT,
      indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(id)
    );
  `);
  
  // Create indexes
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sora_posts_posted_at ON sora_posts(posted_at DESC);
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sora_posts_indexed_at ON sora_posts(indexed_at DESC);
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sora_posts_text ON sora_posts USING gin(to_tsvector('english', COALESCE(text, '')));
  `);
  
  // Create scanner_stats table
  await client.query(`
    CREATE TABLE IF NOT EXISTS scanner_stats (
      id SERIAL PRIMARY KEY,
      total_scanned INTEGER DEFAULT 0,
      new_posts INTEGER DEFAULT 0,
      duplicate_posts INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      last_scan_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      scan_duration_ms INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle',
      error_message TEXT
    );
  `);
  
  // Initialize scanner_stats
  const statsCheck = await client.query('SELECT COUNT(*) FROM scanner_stats');
  if (parseInt(statsCheck.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO scanner_stats (total_scanned, new_posts, duplicate_posts, errors, status)
      VALUES (0, 0, 0, 0, 'idle')
    `);
  }
  
  success('Database tables initialized');
  client.release();
} catch (err) {
  error(`Failed to initialize tables: ${err.message}`);
  process.exit(1);
}

// Step 6: Test Sora API
info('\nStep 6: Testing Sora API connection...');
function testSoraAPI() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sora.chatgpt.com',
      path: '/backend/project_y/feed?limit=5&cut=nf2_latest',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.items) {
            resolve(json);
          } else {
            reject(new Error(`API returned status ${res.statusCode}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

try {
  const apiData = await testSoraAPI();
  success(`Sora API connection successful! (${apiData.items.length} posts fetched)`);
} catch (err) {
  error(`Sora API connection failed: ${err.message}`);
  warning('Make sure AUTH_BEARER_TOKEN is set in .env');
  process.exit(1);
}

// Step 7: Install npm dependencies
info('\nStep 7: Installing npm dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  success('npm dependencies installed');
} catch (err) {
  error('Failed to install npm dependencies');
  process.exit(1);
}

await pool.end();

// Final summary
log('\n🎉 Setup Complete!', 'green');
log('==================\n', 'green');
log('✅ PostgreSQL installed and configured', 'green');
log('✅ Database created and initialized', 'green');
log('✅ Sora API connection verified', 'green');
log('✅ npm dependencies installed', 'green');

log('\n📊 Quick Start:', 'cyan');
log('===============\n', 'cyan');
log('Start the scanner:', 'yellow');
log('  npm run scanner\n', 'cyan');
log('Start the app:', 'yellow');
log('  npm run dev\n', 'cyan');
log('View dashboard:', 'yellow');
log('  http://localhost:3000/scanner-debug\n', 'cyan');

log('📚 Documentation:', 'cyan');
log('=================\n', 'cyan');
log('  docs/DATABASE_SETUP.md - Detailed setup guide', 'yellow');
log('  docs/README_SCANNER.md - Scanner documentation', 'yellow');
log('  docs/INSTALLATION_COMPLETE.md - Success guide\n', 'yellow');

log('🎯 Your Sora Feed Scanner is ready to use!\n', 'green');

}

// Run the main function
main().catch(console.error);

