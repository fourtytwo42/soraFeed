-- Check what indexes are actually being used
SELECT 
    schemaname,
    tablename,
    indexrelname as index_name,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'sora_posts'
ORDER BY idx_scan DESC;

-- Check table statistics
SELECT 
    schemaname,
    relname,
    seq_scan,
    idx_scan,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE relname = 'sora_posts';

-- Check for missing indexes on foreign keys
SELECT
    t.relname AS table_name,
    a.attname AS column_name,
    COUNT(*) OVER(PARTITION BY a.attrelid, a.attnum) AS column_usage_count
FROM pg_attribute a
JOIN pg_class t ON a.attrelid = t.oid
LEFT JOIN pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey)
WHERE t.relname = 'sora_posts'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND i.indexrelid IS NULL
ORDER BY column_usage_count DESC NULLS LAST;
