#!/bin/bash

echo "🚀 Installing Sora Feed Scanner Dependencies..."

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js and npm first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if PostgreSQL is available
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL not found. Installing PostgreSQL..."
    
    # Detect OS and install PostgreSQL
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
        # CentOS/RHEL/Fedora
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql postgresql-server postgresql-contrib
            sudo postgresql-setup initdb
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y postgresql postgresql-server postgresql-contrib
            sudo postgresql-setup --initdb
        fi
        
        # Start PostgreSQL service
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
        
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install postgresql
            brew services start postgresql
        else
            echo "❌ Homebrew not found. Please install PostgreSQL manually."
            echo "   Visit: https://postgresapp.com/"
            exit 1
        fi
    else
        echo "❌ Unsupported OS. Please install PostgreSQL manually."
        exit 1
    fi
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install pg @types/pg

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please edit .env file with your PostgreSQL credentials!"
    echo "   Default database name: sora_feed"
    echo "   Default user: postgres"
fi

# Create database if PostgreSQL is running
echo "🗄️  Setting up database..."
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw sora_feed; then
    echo "✅ Database 'sora_feed' already exists"
else
    echo "📊 Creating database 'sora_feed'..."
    sudo -u postgres createdb sora_feed
    echo "✅ Database created successfully"
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your database credentials"
echo "2. Start the scanner: npm run scanner"
echo "3. Start the app: npm run dev"
echo "4. Visit: http://localhost:3000/scanner-debug"
echo ""
echo "For detailed setup instructions, see DATABASE_SETUP.md"
