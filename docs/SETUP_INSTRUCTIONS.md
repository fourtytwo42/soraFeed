# 🚀 Quick Setup Instructions

## PostgreSQL Scanner Setup

The Sora Feed app includes a PostgreSQL scanner that indexes posts from the Sora API. To get it working:

### 1. Install Dependencies
```bash
npm install pg @types/pg
```

### 2. Setup Database
```bash
# Create PostgreSQL database
sudo -u postgres createdb sora_feed

# Copy environment template
cp env.example .env

# Edit .env with your database credentials
```

### 3. Start Scanner
```bash
# Start the scanner (in one terminal)
npm run scanner

# Start the app (in another terminal)  
npm run dev
```

### 4. Monitor Progress
Visit these pages to monitor the scanner:
- **Setup Guide**: http://localhost:3000/setup
- **Debug Dashboard**: http://localhost:3000/scanner-debug
- **Main App**: http://localhost:3000

## Current Status

✅ **App builds and runs** without PostgreSQL  
⚠️ **Scanner requires** `npm install pg @types/pg` to function  
📊 **Dashboard shows** helpful setup instructions when not configured  

## Need Help?

- Visit `/setup` for step-by-step instructions
- Check `DATABASE_SETUP.md` for detailed documentation  
- Run `./install-scanner.sh` for automated setup (if npm is available)

## What the Scanner Does

- Polls Sora API every 10 seconds for latest 200 posts
- Automatically detects and skips duplicate posts
- Stores full post + profile data as JSONB in PostgreSQL
- Provides real-time metrics and monitoring dashboard
- Enables full-text search and analytics on indexed posts

Once set up, you'll have a complete local mirror of Sora posts for analysis, search, and custom feed generation!
