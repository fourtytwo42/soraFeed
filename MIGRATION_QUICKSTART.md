# 🚀 Database Migration - Quick Start

## The Simplest Way (5 Minutes)

### 📤 On Source Server:

```bash
cd /path/to/soraFeed
npm run db:backup
```

**Output:** Creates `database-backups/sora_feed_YYYYMMDD_HHMMSS.sql.gz`

---

### 📦 Transfer the File:

```bash
scp database-backups/sora_feed_*.sql.gz user@new-server:/path/to/soraFeed/database-backups/
```

---

### 📥 On Destination Server:

```bash
cd /path/to/soraFeed

# Make sure PostgreSQL is installed
sudo apt-get install postgresql postgresql-contrib

# Make sure your .env file is configured
cp .env.example .env  # Edit with your settings
nano .env

# Restore the database
npm run db:restore database-backups/sora_feed_*.sql.gz
```

---

## ✅ Verify It Worked:

```bash
psql -U postgres -d sora_feed -c "SELECT COUNT(*) FROM posts;"
```

---

## 📚 Need More Options?

See **MIGRATION_GUIDE.md** for:
- JSON export/import method
- Direct server-to-server migration
- Troubleshooting tips
- Security best practices

---

## 🆘 Quick Troubleshooting:

**"bash: npm: command not found"**
```bash
node scripts/pg-dump-migrate.sh export
```

**"Permission denied"**
```bash
chmod +x scripts/pg-dump-migrate.sh
```

**"Database does not exist"**
```bash
sudo -u postgres createdb sora_feed
```

**"Connection refused"**
```bash
sudo systemctl start postgresql
```

---

**That's it!** Your database is now migrated. 🎉

