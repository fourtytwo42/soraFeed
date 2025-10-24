# FINAL MIGRATION STEPS - SIMPLE & FAST

## Problem
Text SQL dumps have issues with:
- Newlines in data being interpreted as commands
- Restriction tokens causing "backslash commands are restricted" errors
- Network streaming is extremely slow (50+ hours)

## Solution
Use the **binary custom format dump** we already created and transfer it to the remote server, then restore it locally there.

## Steps (5-8 minutes total)

### Step 1: Transfer the dump file to remote server

```bash
scp database-backups/full_migration_20251024_050506.dump hendo420@192.168.50.104:/tmp/
```
**Password:** `Country1!`
**Time:** ~2-3 minutes (transferring 793MB)

---

### Step 2: SSH to remote server

```bash
ssh hendo420@192.168.50.104
```
**Password:** `Country1!`

---

### Step 3: On remote server, wipe and restore

```bash
# Wipe existing data
PGPASSWORD=postgres psql -U postgres -d sora_feed -c "TRUNCATE TABLE sora_posts, creators, scanner_stats CASCADE;"

# Restore from binary dump (FAST!)
PGPASSWORD=postgres pg_restore -U postgres -d sora_feed \
    --data-only \
    --jobs=4 \
    --no-owner \
    --no-acl \
    /tmp/full_migration_20251024_050506.dump

# Verify
PGPASSWORD=postgres psql -U postgres -d sora_feed -c "
SELECT 
  'Posts: ' || COUNT(*) FROM sora_posts
UNION ALL
SELECT 
  'Creators: ' || COUNT(*) FROM creators;
"

# Cleanup
rm /tmp/full_migration_20251024_050506.dump
```
**Time:** ~2-3 minutes

---

### Expected Result

```
Posts: 1,758,000
Creators: 398,000
```

---

## Why This Works

1. **Binary format** - No text parsing issues with newlines or special characters
2. **Custom format** - PostgreSQL's most robust dump format
3. **Local restore** - Fast (not limited by network)
4. **Parallel jobs** - Uses 4 cores for speed
5. **No restrictions** - Binary format doesn't use `\restrict` tokens

---

## Alternative: All-in-one command (if you have sshpass)

```bash
# On source server
cd /home/hendo420/soraFeed

# Install sshpass
sudo apt install sshpass

# Run automated migration
sshpass -p 'Country1!' scp database-backups/full_migration_20251024_050506.dump hendo420@192.168.50.104:/tmp/

sshpass -p 'Country1!' ssh hendo420@192.168.50.104 'PGPASSWORD=postgres psql -U postgres -d sora_feed -c "TRUNCATE TABLE sora_posts, creators, scanner_stats CASCADE;" && PGPASSWORD=postgres pg_restore -U postgres -d sora_feed --data-only --jobs=4 --no-owner --no-acl /tmp/full_migration_20251024_050506.dump && PGPASSWORD=postgres psql -U postgres -d sora_feed -c "SELECT COUNT(*) FROM sora_posts;" && rm /tmp/full_migration_20251024_050506.dump'
```

---

**That's it! Your 1.77M posts will be migrated in ~5-8 minutes!** 🚀

