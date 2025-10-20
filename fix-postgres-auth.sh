#!/bin/bash

echo "🔧 Fixing PostgreSQL authentication..."

# Set password for postgres user
echo "Setting password for postgres user..."
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"

# Create database user for current system user
echo "Creating database user for current system user ($USER)..."
sudo -u postgres createuser --superuser $USER 2>/dev/null || echo "User $USER might already exist"

# Create sora_feed database
echo "Creating sora_feed database..."
sudo -u postgres createdb sora_feed 2>/dev/null || echo "Database sora_feed might already exist"

# Grant permissions
echo "Granting permissions..."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sora_feed TO postgres;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sora_feed TO $USER;" 2>/dev/null || echo "Could not grant to $USER"

echo "✅ PostgreSQL authentication setup complete!"
echo ""
echo "Now run: source ~/.nvm/nvm.sh && node test-auth.js"
