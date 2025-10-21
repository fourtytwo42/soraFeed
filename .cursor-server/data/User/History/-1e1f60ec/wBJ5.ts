import { SoraFeedResponse } from '@/types/sora';

export const mockFeedData: SoraFeedResponse = {
  items: [
    {
      post: {
        id: "s_mock_1",
        text: "A serene mountain landscape with flowing water",
        posted_at: Date.now() / 1000,
        updated_at: Date.now() / 1000,
        posted_to_public: true,
        preview_image_url: "https://picsum.photos/400/600?random=1",
        permalink: "https://sora.chatgpt.com/p/s_mock_1",
        attachments: [{
          id: "s_mock_1-attachment-0",
          kind: "sora",
          generation_id: "gen_mock_1",
          generation_type: "video_gen",
          width: 400,
          height: 600,
          task_id: "task_mock_1",
          output_blocked: false,
          encodings: {
            source: { path: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
            md: { path: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
            thumbnail: { path: "https://picsum.photos/400/600?random=1" }
          }
        }]
      },
      profile: {
        user_id: "user-mock-1",
        username: "naturelover",
        display_name: "Nature Explorer",
        permalink: "https://sora.chatgpt.com/profile/naturelover",
        follower_count: 1250,
        following_count: 340,
        post_count: 89,
        verified: false
      }
    },
    {
      post: {
        id: "s_mock_2", 
        text: "Urban cityscape at golden hour",
        posted_at: Date.now() / 1000 - 3600,
        updated_at: Date.now() / 1000 - 3600,
        posted_to_public: true,
        preview_image_url: "https://picsum.photos/400/600?random=2",
        permalink: "https://sora.chatgpt.com/p/s_mock_2",
        attachments: [{
          id: "s_mock_2-attachment-0",
          kind: "sora",
          generation_id: "gen_mock_2", 
          generation_type: "video_gen",
          width: 400,
          height: 600,
          task_id: "task_mock_2",
          output_blocked: false,
          encodings: {
            source: { path: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
            md: { path: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
            thumbnail: { path: "https://picsum.photos/400/600?random=2" }
          }
        }]
      },
      profile: {
        user_id: "user-mock-2",
        username: "cityvibes",
        display_name: "Urban Artist",
        permalink: "https://sora.chatgpt.com/profile/cityvibes",
        follower_count: 2890,
        following_count: 156,
        post_count: 234,
        verified: true
      }
    },
    {
      post: {
        id: "s_mock_3",
        text: "Abstract digital art in motion",
        posted_at: Date.now() / 1000 - 7200,
        updated_at: Date.now() / 1000 - 7200,
        posted_to_public: true,
        preview_image_url: "https://picsum.photos/400/600?random=3",
        permalink: "https://sora.chatgpt.com/p/s_mock_3",
        attachments: [{
          id: "s_mock_3-attachment-0",
          kind: "sora",
          generation_id: "gen_mock_3",
          generation_type: "video_gen", 
          width: 400,
          height: 600,
          task_id: "task_mock_3",
          output_blocked: false,
          encodings: {
            source: { path: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" },
            md: { path: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" },
            thumbnail: { path: "https://picsum.photos/400/600?random=3" }
          }
        }]
      },
      profile: {
        user_id: "user-mock-3",
        username: "digitalartist",
        display_name: "Creative Mind",
        permalink: "https://sora.chatgpt.com/profile/digitalartist",
        follower_count: 5670,
        following_count: 89,
        post_count: 156,
        verified: true
      }
    }
  ]
};
