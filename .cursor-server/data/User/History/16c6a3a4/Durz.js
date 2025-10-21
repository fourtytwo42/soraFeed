const { Pool } = require('pg');

async function testConnection(config, description) {
  console.log(`\n🔍 Testing: ${description}`);
  console.log(`   Host: ${config.host}:${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   User: ${config.user}`);
  console.log(`   Password: ${config.password ? '[SET]' : '[EMPTY]'}`);
  
  const pool = new Pool(config);
  
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT current_user, current_database()');
    console.log(`   ✅ SUCCESS! Connected as: ${result.rows[0].current_user} to database: ${result.rows[0].current_database}`);
    client.release();
    await pool.end();
    return config;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    await pool.end();
    return null;
  }
}

async function findWorkingConnection() {
  console.log('🔍 Testing different PostgreSQL connection methods...');
  
  const configs = [
    // Try with empty password (peer auth)
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: ''
    },
    // Try with null password
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: null
    },
    // Try with postgres password
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'postgres'
    },
    // Try as current system user
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: process.env.USER || 'hendo420',
      password: ''
    },
    // Try with trust method (no password)
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres'
      // No password field at all
    }
  ];
  
  for (const config of configs) {
    const workingConfig = await testConnection(config, `${config.user}@${config.database} with ${config.password ? 'password' : 'no password'}`);
    if (workingConfig) {
      console.log('\n🎉 Found working configuration!');
      return workingConfig;
    }
  }
  
  console.log('\n❌ No working configuration found');
  console.log('\n💡 Possible solutions:');
  console.log('1. Set postgres user password:');
  console.log('   sudo -u postgres psql -c "ALTER USER postgres PASSWORD \'postgres\';"');
  console.log('2. Create database user for current system user:');
  console.log('   sudo -u postgres createuser --superuser $USER');
  console.log('3. Check PostgreSQL configuration:');
  console.log('   sudo cat /etc/postgresql/*/main/pg_hba.conf');
  
  return null;
}

findWorkingConnection().then(config => {
  if (config) {
    console.log('\n📝 Update your .env file with:');
    console.log(`DB_HOST=${config.host}`);
    console.log(`DB_PORT=${config.port}`);
    console.log(`DB_USER=${config.user}`);
    console.log(`DB_PASSWORD=${config.password || ''}`);
    console.log(`DB_NAME=sora_feed`);
  }
  process.exit(config ? 0 : 1);
});
