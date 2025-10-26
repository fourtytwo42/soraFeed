-- Drop the duplicate trigram index (keep idx_posts_text_trgm, drop idx_sora_posts_text_trgm)
DROP INDEX IF EXISTS idx_sora_posts_text_trgm;

-- Consider dropping the duplicate FTS index if not using full-text search
-- DROP INDEX IF EXISTS idx_posts_text_fts;

-- Analyze the table to update statistics
ANALYZE sora_posts;

-- Optionally run VACUUM to reclaim space (can be slow, run during off-hours)
-- VACUUM ANALYZE sora_posts;
