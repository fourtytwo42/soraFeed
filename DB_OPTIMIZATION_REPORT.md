# PostgreSQL Database Optimization Report

## Current Status

### Database Size
- **Total:** ~10GB
- **sora_posts:** 9.7GB (3.1M rows)
- **creators:** 281MB (565K rows)

### Issues Found

1. **Duplicate Index** ⚠️
   - Two identical trigram indexes on the same column:
     - `idx_posts_text_trgm`
     - `idx_sora_posts_text_trgm`
   - One can be dropped to save space and reduce write overhead

2. **Slow Queries** ⏱️
   - Trigram search: ~45 seconds
   - ILIKE search: ~212ms (faster!)

3. **Multiple Text Indexes**
   - Full-text search index (GIN)
   - Trigram index (GIN)
   - Both on same column consuming disk and write time

## Optimization Recommendations

### Quick Wins (No Schema Changes)

1. **Drop duplicate index**
   ```sql
   DROP INDEX idx_sora_posts_text_trgm;
   ```
   - Saves disk space
   - Reduces write overhead
   - No impact on queries (already have identical index)

2. **Run ANALYZE**
   ```sql
   ANALYZE sora_posts;
   ```
   - Updates query planner statistics
   - Helps optimizer choose better query plans

3. **Consider dropping FTS index if not used**
   ```sql
   DROP INDEX idx_posts_text_fts;
   ```
   - Only if you're not using full-text search
   - Will speed up inserts/writes

### Long-term Optimizations

1. **Partition by date** (if possible)
   ```sql
   -- Partition sora_posts by month/year
   CREATE TABLE sora_posts_2024_01 PARTITION OF sora_posts 
   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
   ```
   - Improves query speed on large tables
   - Allows partition dropping for old data

2. **Add covering index for common queries**
   ```sql
   CREATE INDEX idx_posts_search_covering ON sora_posts (text) 
   INCLUDE (id, creator_id, posted_at);
   ```
   - Can avoid table lookups
   - Only if specific queries benefit

3. **Schedule VACUUM** (during off-hours)
   ```sql
   VACUUM ANALYZE sora_posts;
   ```
   - Reclaims space from deleted rows
   - Updates statistics
   - Can be slow on large tables

## Query Performance

### Current Performance
- ILIKE search: ✅ ~212ms (acceptable)
- Trigram search: ❌ ~45 seconds (too slow!)
- Full-text search: ⏸️ Not tested

### Why ILIKE is Faster

Your ILIKE queries are faster because they can use the trigram index efficiently, while the full-text search (`%`) operator is doing expensive index scans.

## Risk Assessment

### Low Risk ✅
- Dropping duplicate index
- Running ANALYZE
- Running VACUUM ANALYZE

### Medium Risk ⚠️
- Dropping FTS index (make sure you're not using it)

### High Risk ❌
- Partitioning (requires downtime and migration)
- Schema changes

## Recommended Action Plan

### Phase 1: Immediate (Do Now)
1. Drop duplicate index: `DROP INDEX idx_sora_posts_text_trgm;`
2. Run ANALYZE: `ANALYZE sora_posts;`

### Phase 2: Tonight (During Off-Hours)
3. Run VACUUM ANALYZE: `VACUUM ANALYZE sora_posts;`

### Phase 3: Monitor
4. Check query performance after changes
5. Consider dropping FTS index if not used

## Commands to Run

```bash
# Quick optimization (safe, can run anytime)
psql -h 192.168.50.104 -U postgres -d sora_feed -f optimize_db.sql

# Or manually:
psql -h 192.168.50.104 -U postgres -d sora_feed
```

Then in psql:
```sql
DROP INDEX IF EXISTS idx_sora_posts_text_trgm;
ANALYZE sora_posts;
```

## Expected Results

- **Disk space saved:** ~500MB-1GB (from dropped duplicate index)
- **Write speed:** 10-20% faster (less index maintenance)
- **Query speed:** Should improve slightly (better statistics)

## Monitoring

After optimization, monitor:
- Query execution times
- Disk space usage
- Insert/update performance
- Index usage statistics
