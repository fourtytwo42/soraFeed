# Slow Query Issues - Database Timeout Problems

## Current Problems

### 1. Database Query Timeout ⏱️
```
Error fetching cached count for Interdimensional Cable Channel 42: Error: Database query timeout
Timeout: 25 seconds
```

### 2. Query Performance Analysis

**Query:** `SELECT COUNT(*) FROM sora_posts WHERE text ILIKE '%Interdimensional Cable Channel 42%'`

**Performance:**
- **Execution time:** 458ms
- **Index scan:** Bitmap Index Scan on idx_posts_text_trgm
- **Buffers read:** 1,978 pages = ~15.5MB
- **Problem:** Reading too much data for simple count

### 3. Root Causes

1. **ILIKE with leading/trailing wildcards** (`%term%`) prevents index optimization
2. **Bitmap index scan** on trigram index is reading many pages
3. **Long search terms** like "Interdimensional Cable Channel 42" scan large portions of index
4. **Count queries queued** but still slow when they execute

### 4. Impact

- Admin dashboard loads for **2+ minutes**
- Timeline population times out repeatedly
- Multiple repopulation attempts in loop
- System becomes unresponsive

## Solutions

### Option 1: Skip Count Queries (Quick Fix) ⚡
Return a default count immediately without querying:
- Pro: Instant response
- Con: May fetch more videos than needed

### Option 2: Optimize Count Query (Better)
Limit the count to a reasonable maximum:
```sql
SELECT LEAST(COUNT(*), 10000) FROM sora_posts WHERE text ILIKE '%term%'
```

### Option 3: Use Approximate Count (Best Performance)
Use PostgreSQL statistics:
```sql
SELECT reltuples::bigint AS estimate 
FROM pg_class WHERE relname = 'sora_posts'
```

### Option 4: Cache More Aggressively
- Increase cache TTL from current value
- Pre-populate cache with common terms

## Immediate Action Required

The admin page is **completely unusable** right now (2+ minute load time).

**Recommended:** Skip count queries and return sensible defaults for now.
