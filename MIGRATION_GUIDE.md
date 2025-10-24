# Database Migration Guide

This guide explains how to migrate your SoraFeed database from one server to another.

## 🚀 Quick Start

There are **three methods** to migrate your database. Choose the one that fits your needs:

### Method 1: pg_dump/pg_restore (Recommended) ⭐
**Best for:** Complete migrations, preserving all PostgreSQL features, indexes, and constraints.

### Method 2: JSON Export/Import
**Best for:** Selective data migration, cross-database migrations, or debugging.

### Method 3: Direct PostgreSQL Connection
**Best for:** Real-time replication or continuous syncing between servers.

---

## Method 1: PostgreSQL Native Backup (pg_dump) ⭐

This is the **most reliable method** for PostgreSQL-to-PostgreSQL migrations.

### On Source Server:

```bash
cd /path/to/soraFeed

# Export the database
npm run db:backup

# Or manually:
bash scripts/pg-dump-migrate.sh export
```

This creates a compressed SQL dump in `database-backups/sora_feed_YYYYMMDD_HHMMSS.sql.gz`

### Transfer to Destination Server:

```bash
# Using SCP
scp database-backups/sora_feed_*.sql.gz user@destination-server:/path/to/soraFeed/database-backups/

# Or using rsync
rsync -avz database-backups/sora_feed_*.sql.gz user@destination-server:/path/to/soraFeed/database-backups/
```

### On Destination Server:

```bash
cd /path/to/soraFeed

# Make sure PostgreSQL is installed and running
sudo systemctl status postgresql

# Set up your .env file with database credentials
nano .env

# Import the database
npm run db:restore database-backups/sora_feed_YYYYMMDD_HHMMSS.sql.gz

# Or manually:
bash scripts/pg-dump-migrate.sh import database-backups/sora_feed_YYYYMMDD_HHMMSS.sql.gz
```

### List Available Backups:

```bash
npm run db:list
```

---

## Method 2: JSON Export/Import

This method exports data to JSON files for more flexibility.

### On Source Server:

```bash
cd /path/to/soraFeed

# Export all data to JSON
npm run db:export
```

This creates a `database-export/` directory with:
- `metadata.json` - Export information
- `schema.json` - Database schema
- `[table_name].json` - Data for each table

### Transfer to Destination Server:

```bash
# Using SCP (transfer entire directory)
scp -r database-export user@destination-server:/path/to/soraFeed/

# Or using rsync
rsync -avz database-export/ user@destination-server:/path/to/soraFeed/database-export/

# Or create a tarball first
tar -czf database-export.tar.gz database-export/
scp database-export.tar.gz user@destination-server:/path/to/soraFeed/
# Then extract on destination: tar -xzf database-export.tar.gz
```

### On Destination Server:

```bash
cd /path/to/soraFeed

# Make sure the database and tables are created
npm run setup

# Import the data
npm run db:import
```

**Note:** This method uses `ON CONFLICT DO NOTHING`, so it won't overwrite existing data. If you need to replace data, manually truncate tables first.

---

## Method 3: Direct PostgreSQL Connection

For ongoing synchronization or if you can open network access between servers.

### Setup on Source Server:

1. **Configure PostgreSQL to accept external connections:**

```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/*/main/postgresql.conf

# Change:
listen_addresses = 'localhost'
# To:
listen_addresses = '*'
# Or specific IP:
listen_addresses = '192.168.1.100,localhost'
```

2. **Configure access control:**

```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Add line for destination server (replace with actual IP):
host    sora_feed    postgres    192.168.1.200/32    md5
```

3. **Restart PostgreSQL:**

```bash
sudo systemctl restart postgresql
```

4. **Open firewall (if needed):**

```bash
sudo ufw allow from 192.168.1.200 to any port 5432
```

### On Destination Server:

1. **Set environment variables to point to source server:**

```bash
# Temporary for migration
export DB_HOST=source-server-ip
export DB_PORT=5432
export DB_NAME=sora_feed
export DB_USER=postgres
export DB_PASSWORD=your_password

# Test connection
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM posts;"
```

2. **Use pg_dump remotely:**

```bash
pg_dump -h source-server-ip -U postgres -d sora_feed | psql -h localhost -U postgres -d sora_feed
```

**Security Warning:** Only use this method temporarily and close external access after migration!

---

## 🔍 Verify Migration

After migration, verify the data:

```bash
# Check table counts
psql -U postgres -d sora_feed -c "
SELECT 
  schemaname,
  tablename,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  n_live_tup as live_rows
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;"

# Check specific tables
psql -U postgres -d sora_feed -c "SELECT COUNT(*) FROM posts;"
psql -U postgres -d sora_feed -c "SELECT COUNT(*) FROM playlists;"
psql -U postgres -d sora_feed -c "SELECT COUNT(*) FROM displays;"
```

---

## 📊 Migration Checklist

### Before Migration:

- [ ] Backup current database on source server
- [ ] Note down current row counts for verification
- [ ] Ensure destination server has enough disk space
- [ ] Install PostgreSQL on destination server
- [ ] Configure `.env` file on destination server
- [ ] Test database connection on destination server

### During Migration:

- [ ] Stop any services writing to the database (optional, for consistency)
- [ ] Export/backup database
- [ ] Transfer files securely
- [ ] Import on destination server

### After Migration:

- [ ] Verify row counts match
- [ ] Test application functionality
- [ ] Update any connection strings
- [ ] Update DNS/load balancers if applicable
- [ ] Close any temporarily opened ports
- [ ] Delete sensitive backup files from insecure locations

---

## 🛠️ Troubleshooting

### "Permission denied" errors:

```bash
# Make scripts executable
chmod +x scripts/*.sh scripts/*.js

# Or run with explicit interpreter
bash scripts/pg-dump-migrate.sh export
node scripts/export-database.js
```

### "Database does not exist" errors:

```bash
# Create database first
sudo -u postgres createdb sora_feed

# Or run full setup
npm run setup
```

### "Connection refused" errors:

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start if needed
sudo systemctl start postgresql

# Check if listening on correct port
ss -tlnp | grep 5432
```

### "No space left on device":

```bash
# Check available space
df -h

# Clean up old backups
rm -f database-backups/sora_feed_*.sql.gz

# Use compression for exports
```

### "Duplicate key" errors on import:

```bash
# If you need to replace data, truncate tables first
psql -U postgres -d sora_feed -c "TRUNCATE TABLE posts CASCADE;"

# Or drop and recreate database
psql -U postgres -c "DROP DATABASE IF EXISTS sora_feed;"
psql -U postgres -c "CREATE DATABASE sora_feed;"
```

---

## 📝 Script Reference

### Available NPM Commands:

| Command | Description |
|---------|-------------|
| `npm run db:export` | Export data to JSON files |
| `npm run db:import` | Import data from JSON files |
| `npm run db:backup` | Create PostgreSQL SQL dump (compressed) |
| `npm run db:restore <file>` | Restore from SQL dump |
| `npm run db:list` | List available backups |

### Direct Script Usage:

```bash
# JSON export/import
node scripts/export-database.js
node scripts/import-database.js

# PostgreSQL native backup/restore
bash scripts/pg-dump-migrate.sh export
bash scripts/pg-dump-migrate.sh import database-backups/backup.sql.gz
bash scripts/pg-dump-migrate.sh list
bash scripts/pg-dump-migrate.sh help
```

---

## 🔐 Security Best Practices

1. **Encrypt backups before transfer:**
```bash
# Encrypt
gpg -c database-backups/sora_feed_*.sql.gz

# Decrypt on destination
gpg database-backups/sora_feed_*.sql.gz.gpg
```

2. **Use SSH tunneling instead of opening ports:**
```bash
# On destination server, create tunnel to source
ssh -L 5432:localhost:5432 user@source-server

# Then connect to localhost:5432
```

3. **Use strong passwords** in `.env` files

4. **Delete backups** from insecure locations after migration

5. **Restrict file permissions:**
```bash
chmod 600 .env
chmod 600 database-backups/*.sql.gz
```

---

## 🆘 Need Help?

- Check logs: `tail -f /var/log/postgresql/*.log`
- Test connections: `psql -h host -U user -d database -c "SELECT version();"`
- Verify environment: `cat .env | grep DB_`

---

## 📄 Files Created

- `scripts/export-database.js` - JSON export script
- `scripts/import-database.js` - JSON import script  
- `scripts/pg-dump-migrate.sh` - PostgreSQL native migration script
- `database-export/` - JSON export directory (created on export)
- `database-backups/` - SQL backup directory (created on backup)

---

**Pro Tip:** Always test your migration on a staging environment first! 🎯


