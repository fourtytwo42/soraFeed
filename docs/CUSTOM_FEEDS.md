# Custom Feed Builder

## Overview

The Custom Feed Builder allows users to create personalized video feeds with timed search blocks that play in sequence. This feature provides a dynamic, automated way to curate content based on multiple search queries.

## Features

### 🎯 Core Functionality

- **Timeline-Based Playback**: Create a sequence of search blocks that play for specified durations
- **Drag-and-Drop Interface**: Intuitive block management with desktop and mobile support
- **Loop Mode**: Option to continuously repeat the feed
- **Random Playback**: Videos are shuffled within each block for variety
- **Local Storage**: Feeds are saved locally and persist across sessions

### 🎨 User Interface

- **Visual Feed Builder**: Full-screen overlay with modern, gradient-based design
- **Block Creation**: Simple form to create search blocks with custom durations
- **Timeline Management**: Visual timeline showing all blocks in sequence
- **Available Blocks Pool**: Create blocks and drag them to the timeline
- **Edit/Delete Controls**: Manage saved feeds directly from the dropdown menu
- **Playback Indicator**: Live status showing current block and search query

## How to Use

### Creating a Custom Feed

1. **Open the Dropdown**: Click the feed selector at the top of the screen
2. **Create Custom Feed**: Click "Create Custom Feed" at the bottom of the dropdown
3. **Name Your Feed**: Enter a descriptive name for your feed
4. **Create Blocks**:
   - Enter a search query
   - Set duration in minutes (1-1440)
   - Click "Create" to add to available blocks
5. **Build Timeline**:
   - Drag blocks from "Available Blocks" to the timeline
   - Reorder blocks by dragging within the timeline
   - Duplicate blocks using the copy icon
   - Remove blocks using the X icon or drag to trash
6. **Configure Options**:
   - Check "Loop forever" to repeat the feed continuously
7. **Save**: Click "Create Feed" to save

### Using a Custom Feed

1. Open the feed dropdown
2. Select your custom feed from the "Custom Feeds" section
3. The feed will start playing automatically
4. A playback indicator shows:
   - Current block number
   - Current search query
   - Loop status (if enabled)

### Managing Custom Feeds

- **Edit**: Click the pencil icon next to a feed in the dropdown
- **Delete**: Click the X icon next to a feed in the dropdown
- **Switch Feeds**: Simply select a different feed from the dropdown

## Technical Details

### Block Structure

```typescript
interface CustomFeedBlock {
  id: string;              // Unique identifier
  searchQuery: string;     // Search term for this block
  durationMinutes: number; // How long to play this block
  order: number;           // Position in timeline
}
```

### Feed Structure

```typescript
interface CustomFeed {
  id: string;              // Unique identifier
  name: string;            // Display name
  blocks: CustomFeedBlock[]; // Timeline blocks
  loop: boolean;           // Whether to loop
  createdAt: number;       // Timestamp
  updatedAt: number;       // Timestamp
}
```

### Playback Logic

1. **Initialization**: Load first block's search results (shuffled)
2. **Timer**: Set timeout for block duration
3. **Transition**: When timer expires:
   - Load next block's search results
   - Update playback state
   - Schedule next transition
4. **Loop/End**: When reaching the last block:
   - If loop enabled: restart from block 1
   - If loop disabled: stop playback

### Storage

- Feeds are stored in `localStorage` under key `soraCustomFeeds`
- Automatic save on create/edit/delete
- No server-side storage required

## Examples

### Example 1: Nature Documentary Feed

```
Name: "Nature Explorer"
Loop: Yes
Blocks:
  1. "ocean wildlife" - 10 minutes
  2. "mountain landscapes" - 10 minutes
  3. "forest animals" - 10 minutes
  4. "desert ecosystem" - 10 minutes
```

### Example 2: Creative Inspiration Feed

```
Name: "Creative Vibes"
Loop: Yes
Blocks:
  1. "abstract art" - 5 minutes
  2. "city architecture" - 5 minutes
  3. "colorful patterns" - 5 minutes
  4. "motion graphics" - 5 minutes
```

### Example 3: Mood-Based Feed

```
Name: "Chill Evening"
Loop: No
Blocks:
  1. "sunset timelapse" - 15 minutes
  2. "calm ocean waves" - 20 minutes
  3. "starry night sky" - 15 minutes
```

## UI/UX Features

### Drag-and-Drop

- **Desktop**: Click and drag blocks with mouse
- **Mobile**: Touch and drag with finger
- **Visual Feedback**: Drop zones highlight when dragging
- **Trash Zone**: Appears when dragging timeline blocks

### Animations

- **Fade In**: Modal overlay smoothly appears
- **Slide Up**: Trash zone slides up from bottom
- **Pulse**: Live playback indicator pulses
- **Hover Effects**: Buttons and blocks respond to hover

### Responsive Design

- **Mobile**: Stacked layout, touch-friendly controls
- **Tablet**: Optimized grid for available blocks
- **Desktop**: Full-width timeline, multi-column blocks

## Keyboard Shortcuts

- **Enter**: Create block when in search input
- **Escape**: Close builder modal (standard browser behavior)

## Limitations

- Maximum duration per block: 1440 minutes (24 hours)
- Minimum duration per block: 1 minute
- No server-side sync (local storage only)
- Search results limited to 50 per block
- No block preview (must save to test)

## Future Enhancements

Potential improvements for future versions:

- [ ] Block preview before adding to timeline
- [ ] Import/export feeds as JSON
- [ ] Share feeds with other users
- [ ] Cloud sync for feeds
- [ ] Advanced scheduling (time of day)
- [ ] Transition effects between blocks
- [ ] Block templates/presets
- [ ] Analytics (most-used blocks, watch time)
- [ ] Collaborative feeds
- [ ] AI-suggested blocks based on viewing history

