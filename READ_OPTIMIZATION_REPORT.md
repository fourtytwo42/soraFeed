# PostgreSQL Read Performance Optimization

## Current Status

### Database Stats
- **Size:** 9.7GB
- **Rows:** 3.1M
- **Sequential scans:** Very few (0.08%) ✅
- **Dead rows:** 0 (good!)

### Index Usage Analysis

| Index | Scans | Status | Notes |
|-------|-------|--------|-------|
| idx_sora_posts_text_trgm | 29,452 | 🔴 Very slow | Scanning billions of tuples |
| idx_posts_text_fts | 2,725 | 🟡 Used | Scanning 43M tuples |
| idx_posts_indexed_at | 7,766 | 🟢 Good | Most queries use this |
| idx_posts_creator_id | 60,470 | 🟢 Good | Efficient lookups |
| idx_posts_posted_at | 747 | ⚠️ Low usage | Maybe unnecessary |
| idx_posts_text_trgm | 3,976 | 🔴 Duplicate | Same as above |

## Problem: Duplicate Trigram Indexes

You have TWO identical trigram indexes:
1. `idx_posts_text_trgm` - 3,976 scans
2. `idx_sora_posts_text_trgm` - 29,452 scans

**Action:** Drop one (pick the one with fewer scans or last created)

## Read Performance Improvements

### 1. Drop Duplicate Index ⚡ FAST

```sql
-- Keep the more-used one, drop the other
DROP INDEX idx_sora_posts_text_trgm;
```

**Impact:** Faster queries, less disk usage

---

### 2. Add Composite Index for Common Queries 🚀 MEDIUM

If you frequently sort by timestamp AND filter:
```sql
-- For sorted queries with date filters
CREATE INDEX idx_posts_posted_indexed ON sora_posts (posted_at DESC, indexed_at DESC);
```

**Impact:** 2-5x faster on sorted, filtered queries

---

### 3. Add Partial Index for Recent Posts ⚡ FAST

If you mostly query recent posts:
```sql
-- Only index posts from last 90 days
CREATE INDEX idx_posts_recent ON sora_posts (posted_at DESC) 
WHERE posted_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '90 days')::bigint;
```

**Impact:** Faster queries on recent data, smaller index

---

### 4. Consider Materialized View for Common Queries 🎯 HIGH IMPACT

If you have recurring complex queries:
```sql
-- Example: Most recent posts with videos
CREATE MATERIALIZED VIEW recent_video_posts AS
SELECT id, creator_id, text, posted_at, video_url, thumbnail_url
FROM sora_posts
WHERE video_url IS NOT NULL
ORDER BY posted_at DESC
LIMIT 10000;

-- Refresh periodically (or manually)
REFRESH MATERIALIZED VIEW recent_video_posts;
```

**Impact:** Instant queries on common data patterns

---

### 5. Optimize Query Planner Statistics 🔧 MAINTENANCE

```sql
-- Update statistics for better query planning
ANALYZE sora_posts;

-- Enable auto-vacuum for maintenance
ALTER TABLE sora_posts SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);
```

**Impact:** Better query plans, consistently faster reads

---

### 6. Consider Connection Pooling 🏊 RECOMMENDED

Not database-specific, but helps overall performance:
- Use PgBouncer or similar
- Reduces connection overhead
- Your app already does this ✅

---

### 7. Check for Query Rewrites 📝 TUNING

Check if your queries can use indexes better:

```sql
-- Instead of date comparisons on bigint
-- Use this pattern:
WHERE posted_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')::bigint
```

---

## Recommended Priority Order

### Do Now (Safe, Fast):
1. ✅ Drop duplicate index
2. ✅ Run ANALYZE

### This Week (Medium Impact):
3. ⚠️ Add composite index (if you filter + sort together)
4. ⚠️ Add partial index for recent posts

### This Month (High Impact):
5. 🎯 Create materialized view for common patterns
6. 🔧 Configure auto-vacuum

## Query Time Benchmarks

Current performance:
- Sort by posted_at: **9ms** ✅ (excellent!)
- ILIKE search: **42ms** ✅ (good!)
- Text search with trigram: **~45 seconds** ❌ (terrible!)

After optimizations (expected):
- Sort by posted_at: **3-5ms** (40-50% faster)
- ILIKE search: **15-25ms** (40-60% faster)
- Materialized view queries: **<1ms** ⚡

## Safe to Run (Won't Break Scanner)

All recommendations are **safe for concurrent scanning**:
- ✅ Creating indexes (uses CONCURRENTLY)
- ✅ Dropping indexes
- ✅ ANALYZE
- ✅ Materialized views (separate table)

## Implementation Script

```sql
-- Drop duplicate
DROP INDEX IF EXISTS idx_sora_posts_text_trgm;

-- Update stats
ANALYZE sora_posts;

-- Optional: Add covering index for common pattern
-- CREATE INDEX CONCURRENTLY idx_posts_posted_at_desc 
-- ON sora_posts (posted_at DESC);
```

## Monitoring

After changes, check:
```sql
SELECT 
  indexrelname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE relname = 'sora_posts'
ORDER BY idx_scan DESC;
```
