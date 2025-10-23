'use client';

import { useState, useEffect } from 'react';
import { Clock, User } from 'lucide-react';
import { TimelineVideo } from '@/types/timeline';

interface QueuePreviewProps {
  displayId: string;
}

interface QueueVideo extends TimelineVideo {
  videoData?: {
    post: {
      id: string;
      text: string;
    };
    profile: {
      username: string;
    };
  };
}

export default function QueuePreview({ displayId }: QueuePreviewProps) {
  const [upcomingVideos, setUpcomingVideos] = useState<QueueVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = async () => {
    if (!displayId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/displays/${displayId}/queue?limit=5`);
      if (!response.ok) {
        throw new Error('Failed to fetch queue');
      }
      
      const data = await response.json();
      
      // Parse video data for each video
      const videosWithData = data.upcomingVideos.map((video: TimelineVideo) => ({
        ...video,
        videoData: video.video_data ? JSON.parse(video.video_data) : null
      }));
      
      setUpcomingVideos(videosWithData);
    } catch (err) {
      console.error('Error fetching queue:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    
    // Refresh queue every 30 seconds
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, [displayId]);

  if (loading && upcomingVideos.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border-l-4 border-gray-300">
        <div className="text-sm text-gray-600">Loading queue...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border-l-4 border-red-300">
        <div className="text-sm text-red-800">Failed to load queue</div>
      </div>
    );
  }

  if (upcomingVideos.length === 0) {
    return (
      <div className="p-4 bg-yellow-50 border-l-4 border-yellow-300">
        <div className="text-sm text-yellow-800">No videos in queue</div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-green-50 border-l-4 border-green-400">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-green-600" />
        <div className="text-sm font-medium text-green-900">Coming Up Next</div>
        <div className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
          {upcomingVideos.length} videos
        </div>
      </div>
      
      <div className="space-y-2">
        {upcomingVideos.map((video, index) => (
          <div key={video.id} className="flex items-start gap-3 p-2 bg-white rounded-lg">
            <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-green-700">{index + 1}</span>
            </div>
            
            <div className="flex-1 min-w-0">
              {video.videoData ? (
                <>
                  <div className="flex items-center gap-1 mb-1">
                    <User className="w-3 h-3 text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">
                      @{video.videoData.profile.username}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 line-clamp-2">
                    {video.videoData.post.text.substring(0, 80)}
                    {video.videoData.post.text.length > 80 && '...'}
                  </div>
                </>
              ) : (
                <div className="text-xs text-gray-500">
                  Video ID: {video.video_id}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
