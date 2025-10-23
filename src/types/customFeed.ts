export interface CustomFeedBlock {
  id: string;
  searchQuery: string;
  videoCount: number; // Number of videos to play in this block
  order: number;
}

export interface CustomFeed {
  id: string;
  name: string;
  blocks: CustomFeedBlock[];
  loop: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CustomFeedPlaybackState {
  currentBlockIndex: number;
  blockStartVideoIndex: number; // Video index where current block started
  currentSearchQuery: string;
  blockElapsedVideos: number; // Number of videos played in current block
  currentVideoIndex: number; // Current video index in the overall queue
  totalVideosInBlock: number; // Total videos in current block
}

export interface BlockQueue {
  blockIndex: number;
  searchQuery: string;
  videos: unknown[]; // SoraFeedItem[] but avoiding circular import
  isLoading: boolean;
  loadedAt: number;
}

export interface VideoQueue {
  videos: unknown[]; // SoraFeedItem[] - main video queue
  currentIndex: number; // Current position in queue
  isLoading: boolean; // Whether we're currently loading more videos
  lastBlockIndex: number; // Last block index that was added to queue
  blockPositions: number[]; // Starting position of each block in the queue
}

export interface CustomFeedTimelineState {
  totalVideos: number; // Total number of videos in timeline
  currentVideoIndex: number; // Current video index (0-based)
  currentBlockIndex: number; // Current block index
  videoProgress: number; // Progress within current video (0-1)
}

