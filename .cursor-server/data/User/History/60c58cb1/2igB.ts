export interface SoraPost {
  id: string;
  text: string | null;
  posted_at: number;
  updated_at: number;
  posted_to_public: boolean;
  preview_image_url: string | null;
  attachments: SoraAttachment[];
  permalink: string;
}

export interface SoraAttachment {
  id: string;
  kind: "sora";
  generation_id: string;
  generation_type: "video_gen";
  width: number;
  height: number;
  task_id: string;
  output_blocked: boolean;
  encodings: {
    source?: { path: string };
    source_wm?: { path: string };
    md?: { path: string };
    gif?: { path: string };
    thumbnail?: { path: string };
    unfurl?: unknown | null;
  };
}

export interface SoraProfile {
  user_id: string;
  username: string;
  display_name?: string | null;
  permalink: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  verified: boolean;
}

export interface SoraFeedItem {
  post: SoraPost;
  profile: SoraProfile;
}

export interface SoraFeedResponse {
  items: SoraFeedItem[];
  cursor?: string | null;
}

export interface SoraRemixTree {
  post: SoraPost;
  profile: SoraProfile;
  children: {
    items: SoraFeedItem[];
    cursor: string | null;
  };
}
