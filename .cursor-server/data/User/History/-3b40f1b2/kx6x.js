const { Pool } = require('pg');

// Test database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres', // Try connecting to default postgres database first
  user: 'postgres',
  password: '', // Empty password to start
});

async function testConnection() {
  try {
    console.log('🔍 Testing PostgreSQL connection...');
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL successfully!');
    
    // Test query
    const result = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', result.rows[0].version);
    
    // Check if sora_feed database exists
    const dbCheck = await client.query("SELECT 1 FROM pg_database WHERE datname = 'sora_feed'");
    if (dbCheck.rows.length > 0) {
      console.log('✅ Database "sora_feed" already exists');
    } else {
      console.log('⚠️  Database "sora_feed" does not exist');
      console.log('🔧 Creating database...');
      await client.query('CREATE DATABASE sora_feed');
      console.log('✅ Database "sora_feed" created successfully');
    }
    
    client.release();
    await pool.end();
    
    console.log('\n🎉 Database setup complete!');
    console.log('Next steps:');
    console.log('1. Start scanner: npm run scanner');
    console.log('2. Visit dashboard: http://localhost:3000/scanner-debug');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('- PostgreSQL is not running or not accessible');
      console.log('- Check if PostgreSQL service is started');
      console.log('- Verify PostgreSQL is installed and configured');
    } else if (error.code === '28P01') {
      console.log('- Authentication failed');
      console.log('- Check username/password in .env file');
      console.log('- Try setting a password for postgres user');
    } else if (error.code === '3D000') {
      console.log('- Database does not exist (this is normal for first run)');
    }
    
    console.log('\n📋 Common fixes:');
    console.log('- Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib');
    console.log('- Start service: sudo systemctl start postgresql');
    console.log('- Set password: sudo -u postgres psql -c "ALTER USER postgres PASSWORD \'yourpassword\';"');
    
    process.exit(1);
  }
}

testConnection();
