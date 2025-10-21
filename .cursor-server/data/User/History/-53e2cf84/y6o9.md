# Sora Feed Scanner - Database Setup Guide

This guide will help you set up the PostgreSQL database and scanner for the Sora Feed application.

## Prerequisites

- PostgreSQL 10 or higher installed and running
- Node.js and npm installed
- Access to create databases and tables

## Step 1: Create Database

Connect to PostgreSQL and create the database:

```bash
psql -U postgres
```

Then run:

```sql
CREATE DATABASE sora_feed;
```

Exit psql with `\q`

## Step 2: Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp env.example .env
```

Edit `.env` and set your database credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sora_feed
DB_USER=postgres
DB_PASSWORD=your_actual_password
```

## Step 3: Install Dependencies

```bash
npm install
```

This will install `pg` and `@types/pg` packages needed for PostgreSQL connection.

## Step 4: Initialize Database Tables

The scanner will automatically create the required tables on first run. The schema includes:

### `sora_posts` Table
- `id` (TEXT, PRIMARY KEY) - Unique post ID
- `post_data` (JSONB) - Full post data from API
- `profile_data` (JSONB) - Full profile data from API
- `text` (TEXT) - Post caption/text
- `posted_at` (BIGINT) - Original post timestamp
- `updated_at` (BIGINT) - Last update timestamp
- `like_count` (INTEGER) - Number of likes
- `view_count` (INTEGER) - Number of views
- `remix_count` (INTEGER) - Number of remixes
- `permalink` (TEXT) - Permanent link to post
- `indexed_at` (TIMESTAMP) - When post was indexed
- `last_updated` (TIMESTAMP) - Last update in our DB

### `scanner_stats` Table
- `id` (SERIAL, PRIMARY KEY)
- `total_scanned` (INTEGER) - Total posts scanned
- `new_posts` (INTEGER) - New posts added
- `duplicate_posts` (INTEGER) - Duplicate posts found
- `errors` (INTEGER) - Total errors encountered
- `last_scan_at` (TIMESTAMP) - Last scan timestamp
- `scan_duration_ms` (INTEGER) - Last scan duration
- `status` (TEXT) - Current scanner status
- `error_message` (TEXT) - Last error message

## Step 5: Start the Scanner

Run the scanner in a separate terminal:

```bash
npm run scanner
```

The scanner will:
- Initialize the database tables if they don't exist
- Fetch the latest 200 posts from Sora API
- Store new posts (skip duplicates)
- Update statistics
- Repeat every 10 seconds

### Scanner Output Example:

```
🚀 Sora Feed Scanner Starting...
📊 Database: sora_feed
🔧 Initializing database...
✅ Database initialized successfully

🔍 [2025-01-20T12:00:00.000Z] Starting scan...
📥 Fetched 200 posts from API
✅ Scan complete:
   - New posts: 15
   - Duplicates: 185
   - Total: 200
   - Duration: 1234ms

⏰ Scheduling scans every 10 seconds...
```

## Step 6: View Debug Dashboard

Start the Next.js development server:

```bash
npm run dev
```

Then visit:

```
http://localhost:3000/scanner-debug
```

The dashboard shows:
- Scanner status (scanning, success, error, idle)
- Total posts scanned
- New posts added
- Duplicate posts found
- Last scan time and duration
- Total posts in database
- Recent posts table
- Posts per day statistics (last 7 days)
- Auto-refresh every 2 seconds

## Troubleshooting

### Connection Error

If you see `connection refused`:
1. Make sure PostgreSQL is running: `sudo systemctl status postgresql`
2. Check your `.env` credentials
3. Verify database exists: `psql -U postgres -l`

### Permission Errors

If you see permission errors:
```bash
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE sora_feed TO postgres;
```

### Port Already in Use

If port 5432 is in use, change `DB_PORT` in `.env` to match your PostgreSQL port.

## Stopping the Scanner

Press `Ctrl+C` in the scanner terminal. It will gracefully shut down and mark the status as "stopped" in the database.

## Monitoring

### Check Database Status

```bash
psql -U postgres -d sora_feed
```

Then run SQL queries:

```sql
-- Total posts
SELECT COUNT(*) FROM sora_posts;

-- Recent posts
SELECT id, text, indexed_at FROM sora_posts ORDER BY indexed_at DESC LIMIT 10;

-- Scanner stats
SELECT * FROM scanner_stats;

-- Posts indexed today
SELECT COUNT(*) FROM sora_posts WHERE indexed_at > CURRENT_DATE;
```

### Logs

Scanner logs are printed to stdout. To save logs:

```bash
npm run scanner 2>&1 | tee scanner.log
```

## Performance Notes

- The scanner uses database transactions to ensure data consistency
- Duplicate detection is O(1) using PRIMARY KEY constraint
- Indexes are created on `posted_at` and `indexed_at` for fast queries
- Full-text search index on `text` column for search capabilities

## Database Maintenance

### Backup Database

```bash
pg_dump -U postgres sora_feed > sora_feed_backup.sql
```

### Restore Database

```bash
psql -U postgres sora_feed < sora_feed_backup.sql
```

### Clear All Data (Careful!)

```bash
psql -U postgres -d sora_feed -c "TRUNCATE TABLE sora_posts, scanner_stats RESTART IDENTITY;"
```

