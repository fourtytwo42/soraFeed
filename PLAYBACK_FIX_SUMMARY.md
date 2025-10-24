# Playback Issues Fix Summary

## Issues Fixed

### Issue 1: Video Restart at End
**Problem**: When a video ended, it would briefly show the first second of the same video before jumping to the next video.

**Root Cause**: After marking a video as played, the system waited up to 1 second for the next polling cycle before loading the next video. During this delay, the video element was in an undefined state.

**Fix**: Modified `handleVideoEnd()` in `/src/app/player/[code]/page.tsx` to immediately call `pollServer()` after marking a video as played, eliminating the delay.

```typescript
// Before: Waited for next polling cycle (up to 1 second delay)
await markAsPlayed();
// ... next poll happens automatically

// After: Immediate poll for next video
await markAsPlayed();
pollServer(); // Immediately fetch next video
```

### Issue 2: Block Progression Not Working
**Problem**: The "Stand Up" block was stuck at 5/10 videos played, even though the playlist should continue through all blocks sequentially.

**Root Causes**:
1. `getNextTimelineVideo()` didn't respect the display's current `timeline_position`
2. Videos at earlier positions could be returned even if the display had moved past them
3. If a video was skipped for any reason, it would get "stuck" and block progression

**Fixes**:

1. **Updated `getNextTimelineVideo()` in `/src/lib/queue-manager.ts`**:
   - Now checks the display's current timeline position
   - Only returns videos at or after the current position
   - Prevents returning "old" queued videos that should have already played

```typescript
// Before: Just get any queued video
SELECT * FROM timeline_videos 
WHERE display_id = ? AND status = 'queued'
ORDER BY timeline_position ASC
LIMIT 1

// After: Respect current timeline position
SELECT * FROM timeline_videos 
WHERE display_id = ? AND status = 'queued' AND timeline_position >= ?
ORDER BY timeline_position ASC
LIMIT 1
```

2. **Created maintenance scripts**:
   - `scripts/debug-timeline.js` - Diagnose timeline issues
   - `scripts/fix-timeline-position.js` - Fix position mismatches and mark skipped videos

## Files Modified

1. `/src/app/player/[code]/page.tsx`
   - Added immediate `pollServer()` call after marking video as played

2. `/src/lib/queue-manager.ts`
   - Updated `getNextTimelineVideo()` to respect timeline position
   - Added display position check before returning next video

3. New Scripts:
   - `scripts/debug-timeline.js` - Debug timeline state
   - `scripts/fix-timeline-position.js` - Fix position issues

## Testing Results

### Before Fix:
- Display Position: 44
- Stand Up: 5/10 videos played
- Next video: Position 43 (wrong - already past this position!)
- Videos would restart at end

### After Fix:
- Display Position: 44
- Stand Up: 6/10 videos (now continuing)
- Next video: Position 44 (correct!)
- Smooth transitions between videos

## Usage

### Debug Timeline Issues:
```bash
node scripts/debug-timeline.js <DISPLAY_CODE>
```

### Fix Timeline Position Mismatch:
```bash
node scripts/fix-timeline-position.js <DISPLAY_CODE>
```

This will:
- Correct the display's timeline position
- Mark any "stuck" queued videos as skipped
- Allow playback to continue normally

## Prevention

The fixes prevent these issues from occurring in the future by:
1. Eliminating delays between videos
2. Ensuring timeline position is always respected
3. Preventing "backwards" video selection

## Notes

- The immediate poll after video end may cause a brief loading state
- This is much better than showing a video restart
- If a display gets stuck again, run the fix script to correct it
- The system will now properly handle edge cases like network delays or skipped videos

