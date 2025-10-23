export interface Display {
  id: string;
  name: string;
  created_at: string;
  last_ping?: string;
  status: 'offline' | 'online' | 'playing' | 'paused';
  current_video_id?: string;
  current_position: number;
  current_block_id?: string;
  current_playlist_id?: string;
  timeline_position: number;
  commands: string; // JSON string of pending commands
}

export interface Playlist {
  id: string;
  display_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  total_blocks: number;
  total_videos: number;
  loop_count: number;
}

export interface PlaylistBlock {
  id: string;
  playlist_id: string;
  search_term: string;
  video_count: number;
  fetch_mode: 'newest' | 'random';
  format: 'mixed' | 'wide' | 'tall';
  block_order: number;
  created_at: string;
  times_played: number;
  last_played_at?: string;
}

export interface TimelineVideo {
  id: string;
  display_id: string;
  playlist_id: string;
  block_id: string;
  video_id: string;
  block_position: number;
  timeline_position: number;
  loop_iteration: number;
  status: 'queued' | 'playing' | 'played' | 'skipped';
  played_at?: string;
  video_data?: string; // JSON string of cached video metadata
  created_at: string;
}

export interface VideoHistory {
  id: string;
  display_id: string;
  video_id: string;
  block_id: string;
  loop_iteration: number;
  played_at: string;
}

export interface TimelineProgress {
  currentBlock: {
    name: string;
    progress: number; // 0-100%
    currentVideo: number;
    totalVideos: number;
  };
  blocks: Array<{
    name: string;
    videoCount: number;
    isActive: boolean;
    isCompleted: boolean;
    timesPlayed: number;
  }>;
  overallProgress: {
    currentPosition: number;
    totalInCurrentLoop: number;
    loopCount: number;
  };
}

export interface DisplayCommand {
  type: 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'playVideo' | 'mute' | 'unmute';
  payload?: {
    position?: number;
    videoId?: string;
  };
  timestamp: number;
}

export interface BlockDefinition {
  searchTerm: string;
  videoCount: number;
  fetchMode: 'newest' | 'random';
  format: 'mixed' | 'wide' | 'tall';
}
