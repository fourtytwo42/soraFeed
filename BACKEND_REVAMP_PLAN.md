# Backend Performance Revamp Plan

## Current Issues Identified

### 1. **Timeline Video Management**
- **Problem**: Old videos not being cleared, causing 40 videos when only 10 should exist
- **Impact**: Incorrect video counts displayed to users
- **Root Cause**: Timeline video deletion happens in multiple places inconsistently

### 2. **Database Query Performance**
- **Problem**: Count queries taking 3-5 seconds each, blocking admin page
- **Impact**: Admin page freezes, terrible UX
- **Root Cause**: No proper caching, complex queries on 3M+ row database

### 3. **Playlist Activation**
- **Problem**: Playlists not auto-activating when created
- **Impact**: Users have to manually activate playlists
- **Root Cause**: Logic only activates first playlist, not subsequent ones

### 4. **Video Count Display**
- **Problem**: Static "1000" displayed instead of real counts
- **Impact**: Users can't see actual available video counts
- **Root Cause**: Count queries disabled due to performance issues

## Architecture Improvements

### Phase 1: Database Optimization (Week 1)

#### 1.1 Add Database Indexes
```sql
-- Performance critical indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sora_posts_text_search 
  ON sora_posts USING gin(to_tsvector('english', text));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sora_posts_format 
  ON sora_posts(width, height) WHERE width IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sora_posts_created 
  ON sora_posts(posted_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timeline_videos_display_status 
  ON timeline_videos(display_id, status, timeline_position);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_history_block_display 
  ON video_history(display_id, block_id, played_at);
```

#### 1.2 Materialized View for Fast Counts
```sql
-- Pre-aggregated counts by search term and format
CREATE MATERIALIZED VIEW video_counts_by_search AS
SELECT 
  search_term,
  format,
  COUNT(*) as total_count,
  LAST_UPDATED()
FROM sora_posts
GROUP BY search_term, format;

-- Refresh on schedule (hourly)
CREATE INDEX ON video_counts_by_search(search_term, format);
```

#### 1.3 Query Optimization
- Simplify count queries: Just use ILIKE for counts, no full-text search
- Remove OR conditions - use single most efficient search method
- Add LIMIT to all COUNT queries as sanity check

### Phase 2: Caching Layer (Week 1-2)

#### 2.1 Redis Implementation
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'sorafeed:'
});

// Cache video counts with 24h TTL
async function getVideoCount(searchTerm: string, format: string): Promise<number> {
  const key = `count:${searchTerm}:${format}`;
  
  // Try cache first
  const cached = await redis.get(key);
  if (cached) return parseInt(cached);
  
  // Query database
  const count = await queryCount(searchTerm, format);
  
  // Cache for 24 hours
  await redis.setex(key, 86400, count.toString());
  
  return count;
}
```

#### 2.2 Request-Level Caching
- Cache API responses in memory for 5 seconds
- Prevent duplicate queries during same request
- Smart invalidation when data changes

### Phase 3: Async Job Queue (Week 2)

#### 3.1 Background Processing
```typescript
// Use Bull/BullMQ for async jobs
import Queue from 'bull';

const countQueue = new Queue('video-counts', {
  redis: { host: 'localhost', port: 6379 }
});

// Process count queries in background
countQueue.process(async (job) => {
  const { searchTerm, format } = job.data;
  const count = await queryCount(searchTerm, format);
  await updateCache(searchTerm, format, count);
  return count;
});

// Add job with high priority
await countQueue.add('count', { searchTerm, format }, {
  priority: 1,
  attempts: 3
});
```

#### 3.2 Smart Pre-fetching
- Pre-load counts for active playlists
- Pre-fetch next videos while current is playing
- Warm up cache on server start

### Phase 4: API Optimization (Week 2-3)

#### 4.1 Response Compression
```typescript
import compression from 'compression';
app.use(compression());
```

#### 4.2 GraphQL API
- Replace REST with GraphQL for flexible queries
- Only fetch what's needed
- Built-in query batching and caching

#### 4.3 Pagination & Streaming
- Implement cursor-based pagination
- Stream large result sets
- Use HTTP/2 server push for critical resources

### Phase 5: Timeline Management Overhaul (Week 3)

#### 5.1 Centralized Timeline Service
```typescript
class TimelineService {
  // Single source of truth for timeline operations
  async repopulate(displayId: string, playlistId: string): Promise<void> {
    // 1. Clear old videos
    await this.clearTimeline(displayId);
    
    // 2. Get playlist blocks
    const blocks = await PlaylistManager.getPlaylistBlocks(playlistId);
    
    // 3. Populate in single transaction
    await this.populateTimeline(displayId, blocks);
  }
  
  private async clearTimeline(displayId: string): Promise<void> {
    // Clear timeline_videos
    // Clear video_history for fresh start
    // Reset display position
  }
}
```

#### 5.2 Queue Video Streaming
- Don't populate all 10 videos upfront
- Stream videos as needed (next 3-5 only)
- Background job pre-fetches more

#### 5.3 Smart Deduplication
- Check video_history before adding to timeline
- Skip recently played videos automatically
- Rotate content intelligently

## Implementation Strategy

### Week 1: Foundation
1. Add database indexes
2. Implement Redis caching
3. Create TimelineService

### Week 2: Performance
1. Setup Bull queue
2. Implement async count queries
3. Add GraphQL endpoint
4. Optimize admin API

### Week 3: Polish
1. Add monitoring & logging
2. Performance testing
3. Documentation
4. Deployment

## Success Metrics

- Admin page loads < 500ms
- Count queries < 100ms (with cache)
- Timeline repopulation < 2s
- Zero blocking queries
- 99.9% uptime

## Risk Mitigation

- Keep current system running in parallel
- Feature flags for gradual rollout
- Automated rollback on errors
- Performance monitoring alerts
