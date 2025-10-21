#!/bin/bash

echo "🚀 Setting up PostgreSQL and Sora Feed Scanner..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
    SUDO_CMD=""
else
    SUDO_CMD="sudo"
fi

# Update package list
print_info "Updating package list..."
$SUDO_CMD apt update

# Install PostgreSQL (latest version available)
print_info "Installing PostgreSQL..."
$SUDO_CMD apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL service
print_info "Starting PostgreSQL service..."
$SUDO_CMD systemctl start postgresql
$SUDO_CMD systemctl enable postgresql

# Check PostgreSQL status
print_info "Checking PostgreSQL status..."
if $SUDO_CMD systemctl is-active --quiet postgresql; then
    print_status "PostgreSQL is running"
else
    print_error "PostgreSQL failed to start"
    exit 1
fi

# Set up PostgreSQL user and database
print_info "Setting up PostgreSQL database..."

# Create sora_feed database
$SUDO_CMD -u postgres createdb sora_feed 2>/dev/null || {
    print_warning "Database sora_feed might already exist"
}

# Set a password for postgres user (using 'postgres' as default)
$SUDO_CMD -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null || {
    print_warning "Could not set postgres password, might already be set"
}

# Update .env file with database configuration
print_info "Updating .env file..."

# Check if database config already exists in .env
if grep -q "DB_HOST" .env; then
    print_warning ".env already contains database configuration"
else
    cat >> .env << EOF

# Database Configuration for Scanner
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sora_feed
DB_USER=postgres
DB_PASSWORD=postgres
EOF
    print_status "Database configuration added to .env"
fi

# Test database connection
print_info "Testing database connection..."

# Create a simple test script
cat > test-connection.js << 'EOF'
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log('✅ Database connection successful!');
    console.log('📊 PostgreSQL version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
    client.release();
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
EOF

# Test the connection
if node test-connection.js; then
    print_status "Database connection test passed"
else
    print_error "Database connection test failed"
    print_info "Trying alternative configuration..."
    
    # Try with empty password
    sed -i 's/DB_PASSWORD=postgres/DB_PASSWORD=/' .env
    
    if node test-connection.js; then
        print_status "Database connection successful with empty password"
    else
        print_error "Could not establish database connection"
        print_info "Manual steps required:"
        echo "1. Check PostgreSQL status: sudo systemctl status postgresql"
        echo "2. Set postgres password: sudo -u postgres psql -c \"ALTER USER postgres PASSWORD 'yourpassword';\""
        echo "3. Update .env file with correct password"
        exit 1
    fi
fi

# Clean up test file
rm -f test-connection.js

# Initialize database tables
print_info "Initializing database tables..."
node -e "
const { initDatabase } = require('./src/lib/db.ts');
initDatabase().then(() => {
  console.log('✅ Database tables initialized');
  process.exit(0);
}).catch(err => {
  console.error('❌ Failed to initialize database:', err.message);
  process.exit(1);
});
" 2>/dev/null || {
    print_warning "Could not initialize database tables automatically"
    print_info "Tables will be created when scanner starts"
}

print_status "PostgreSQL setup complete!"
echo ""
echo "🎉 Setup Summary:"
echo "=================="
echo "✅ PostgreSQL installed and running"
echo "✅ Database 'sora_feed' created"
echo "✅ User 'postgres' configured"
echo "✅ .env file updated"
echo ""
echo "🚀 Next Steps:"
echo "=============="
echo "1. Start the scanner:"
echo "   npm run scanner"
echo ""
echo "2. In another terminal, start the app:"
echo "   npm run dev"
echo ""
echo "3. Visit the dashboard:"
echo "   http://localhost:3000/scanner-debug"
echo ""
echo "4. View setup guide:"
echo "   http://localhost:3000/setup"
echo ""

# Check if npm run dev is already running
if pgrep -f "next dev" > /dev/null; then
    print_status "Next.js development server is already running"
else
    print_info "You can now start the development server with: npm run dev"
fi

print_status "All done! Your Sora Feed Scanner is ready to use! 🎉"
