export interface CustomFeedBlock {
  id: string;
  searchQuery: string;
  durationSeconds: number; // Changed from minutes to seconds for finer control
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
  blockStartTime: number;
  currentSearchQuery: string;
  blockElapsedTime: number; // Track elapsed time in current block
  currentVideoStartTime: number; // When current video started
  currentVideoDuration: number; // Duration of current video
}

export interface BlockQueue {
  blockIndex: number;
  searchQuery: string;
  videos: any[]; // SoraFeedItem[] but avoiding circular import
  isLoading: boolean;
  loadedAt: number;
}

