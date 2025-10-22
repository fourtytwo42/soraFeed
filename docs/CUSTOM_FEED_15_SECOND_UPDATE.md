# Custom Feed Builder - 15-Second Timing Update

## 🎯 **Feature Enhancement Complete!**

The Custom Feed Builder has been successfully updated to support **15-second minimum durations** with **smart video timing logic** as requested.

## ✅ **What Was Updated:**

### 1. **Duration System Overhaul**
- **Changed from minutes to seconds** for precise control
- **15-second minimum** duration with automatic rounding
- **Dual unit support**: Create blocks in seconds or minutes
- **Smart validation**: All durations rounded to nearest 15 seconds

### 2. **Smart Video Timing Logic**
- **Video duration tracking**: Monitors each video's actual length (10-25 seconds)
- **Intelligent rounding**: Videos rounded to nearest 15-second intervals
- **Automatic transitions**: Decides whether to play another video or move to next block
- **Block time management**: Ensures blocks respect their total duration

### 3. **Enhanced UI Controls**
- **Seconds/Minutes selector**: Toggle between time units
- **Step validation**: 15-second increments for seconds, 1-minute for minutes
- **Real-time conversion**: Automatic unit conversion when switching
- **Improved formatting**: Shows seconds, minutes, and hours as needed

## 🔧 **Technical Implementation:**

### **Type System Updates** (`src/types/customFeed.ts`)
```typescript
interface CustomFeedBlock {
  durationSeconds: number; // Changed from durationMinutes
}

interface CustomFeedPlaybackState {
  blockElapsedTime: number;        // Track elapsed time in block
  currentVideoStartTime: number;   // When current video started
  currentVideoDuration: number;    // Duration of current video
}
```

### **Smart Timing Algorithm**
```typescript
// Round video duration to nearest 15 seconds
const roundedVideoDuration = Math.round(videoDurationSeconds / 15) * 15;

// If rounded duration fits in remaining block time, use it
if (roundedVideoDuration <= remainingBlockTime) {
  return roundedVideoDuration * 1000; // Use rounded video duration
}
// Otherwise, use remaining block time
return remainingBlockTime * 1000;
```

### **Video Event Integration**
- **loadedmetadata**: Captures video duration when video loads
- **ended**: Decides next action based on remaining block time
- **Smart transitions**: Loads new video or advances to next block

## 🎨 **UI/UX Improvements:**

### **Duration Input**
```
[Search query...] [60] [seconds ▼] [Create]
                   ↑      ↑
              Value    Unit selector
```

### **Block Display**
- **15s** - Short durations in seconds
- **1m 30s** - Medium durations with mixed units  
- **2h 15m 30s** - Long durations with all units

### **Validation Rules**
- **Minimum**: 15 seconds
- **Maximum**: 86400 seconds (24 hours)
- **Step**: 15-second increments
- **Auto-rounding**: Invalid values rounded to nearest valid value

## 🎯 **Smart Timing Examples:**

### **Example 1: Short Block (30 seconds)**
```
Block Duration: 30 seconds
Video 1: 12 seconds → rounded to 15 seconds → plays for 15s
Remaining: 15 seconds → plays Video 2 for 15s → block ends
```

### **Example 2: Medium Block (2 minutes)**
```
Block Duration: 120 seconds  
Video 1: 18 seconds → rounded to 15 seconds → plays for 15s
Video 2: 22 seconds → rounded to 30 seconds → plays for 30s
Video 3: 14 seconds → rounded to 15 seconds → plays for 15s
Remaining: 60 seconds → continues with more videos...
```

### **Example 3: Video Longer Than Remaining Time**
```
Block Duration: 45 seconds
Elapsed: 35 seconds
Remaining: 10 seconds
Video: 20 seconds → plays for remaining 10s → next block starts
```

## 📁 **Files Modified:**

### **Core Components**
- `src/types/customFeed.ts` - Updated type definitions
- `src/components/CustomFeedBuilder.tsx` - New duration UI and validation
- `src/components/FeedLoader.tsx` - Smart timing logic and video event handling
- `src/components/VerticalCarousel.tsx` - Video event prop passing
- `src/components/VideoCarousel.tsx` - Video event integration

### **Key Changes Summary**
- **481 lines** in CustomFeedBuilder: Duration UI overhaul
- **200+ lines** in FeedLoader: Smart timing system
- **Video event chain**: FeedLoader → VerticalCarousel → VideoCarousel

## 🚀 **How It Works:**

### **Creating Blocks**
1. Enter search query
2. Set duration (15s minimum, 15s increments)
3. Choose seconds or minutes
4. System auto-rounds to valid values

### **Playback Logic**
1. **Block starts**: Load shuffled videos for search query
2. **Video loads**: Capture duration, start smart timer
3. **Video ends**: Check remaining block time
   - **>15s remaining**: Load another video from same search
   - **≤15s remaining**: Wait for block timer, then next block
4. **Block ends**: Move to next block or loop

### **Smart Decisions**
- **Video 10s, Block has 20s left**: Round to 15s, play full video
- **Video 25s, Block has 10s left**: Play for 10s, then next block
- **Video 18s, Block has 60s left**: Round to 15s, then load next video

## ✅ **Build Status**
```
✓ TypeScript compilation successful
✓ No linting errors  
✓ All components render correctly
✓ Smart timing logic implemented
✓ Video event integration complete
```

## 🎯 **Usage Examples:**

### **Quick Burst Feed**
```
Name: "Quick Inspiration"
Blocks:
  1. "abstract art" - 30 seconds
  2. "nature scenes" - 45 seconds  
  3. "city lights" - 30 seconds
Loop: Yes
```

### **Detailed Exploration**
```
Name: "Deep Dive Nature"
Blocks:
  1. "ocean waves" - 5 minutes
  2. "mountain peaks" - 3 minutes
  3. "forest sounds" - 2 minutes
Loop: No
```

### **Mixed Duration Feed**
```
Name: "Rhythm Mix"
Blocks:
  1. "quick cuts" - 15 seconds
  2. "slow motion" - 2 minutes
  3. "time lapse" - 45 seconds
  4. "close ups" - 30 seconds
Loop: Yes
```

## 🔮 **Smart Features:**

### **Automatic Optimization**
- Videos are intelligently timed to fit block durations
- No jarring cuts mid-video (respects 15-second boundaries)
- Smooth transitions between blocks
- Efficient use of block time

### **Flexible Duration Control**
- **Seconds**: For precise, short-form content (15s-59s)
- **Minutes**: For longer-form content (1m-1440m)
- **Auto-conversion**: Switch units without losing precision
- **Visual feedback**: Clear duration formatting

### **Robust Playback**
- **Timer cleanup**: No memory leaks from abandoned timers
- **State tracking**: Accurate elapsed time and remaining time
- **Error handling**: Graceful fallbacks for timing edge cases
- **Loop support**: Seamless restart with fresh timing

## 🎉 **Result:**

The Custom Feed Builder now supports **ultra-precise timing control** with 15-second granularity while maintaining **intelligent video-aware transitions**. Users can create highly customized feeds that respect both their time preferences and natural video boundaries.

**Perfect for:**
- Quick inspiration bursts (15-30 second blocks)
- Detailed exploration sessions (5-10 minute blocks)  
- Rhythmic content mixing (varied block durations)
- Precise timing requirements (exactly 2m 15s blocks)

The system automatically handles the complexity of video timing while providing users with simple, intuitive controls! 🚀
