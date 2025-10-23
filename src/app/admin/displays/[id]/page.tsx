'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Plus, Settings, Eye, Trash2 } from 'lucide-react';
import { Display, Playlist, TimelineVideo } from '@/types/timeline';
import TimelineProgressComponent from '@/components/admin/TimelineProgress';
import PlaylistBuilder from '@/components/admin/PlaylistBuilder';

interface DisplayWithProgress extends Display {
  isOnline: boolean;
  progress?: any;
}

export default function DisplayManagement() {
  const params = useParams();
  const router = useRouter();
  const displayId = params.id as string;

  const [display, setDisplay] = useState<DisplayWithProgress | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [queuedVideos, setQueuedVideos] = useState<TimelineVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPlaylistBuilder, setShowPlaylistBuilder] = useState(false);

  // Fetch display data
  const fetchDisplayData = async () => {
    try {
      // Fetch display info and status
      const [displayResponse, playlistsResponse, timelineResponse] = await Promise.all([
        fetch(`/api/poll/${displayId}`),
        fetch(`/api/displays/${displayId}/playlists`),
        fetch(`/api/timeline/${displayId}`)
      ]);

      if (!displayResponse.ok) {
        throw new Error('Display not found');
      }

      const displayData = await displayResponse.json();
      const playlistsData = playlistsResponse.ok ? await playlistsResponse.json() : { playlists: [], activePlaylist: null };
      const timelineData = timelineResponse.ok ? await timelineResponse.json() : { progress: null, queuedVideos: [] };

      setDisplay(displayData.display);
      setPlaylists(playlistsData.playlists);
      setActivePlaylist(playlistsData.activePlaylist);
      setQueuedVideos(timelineData.queuedVideos);
      setError(null);
    } catch (err) {
      console.error('Error fetching display data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch display data');
    } finally {
      setLoading(false);
    }
  };

  // Send command to display
  const sendCommand = async (type: string, payload?: any) => {
    try {
      const response = await fetch(`/api/displays/${displayId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, payload })
      });
      
      if (!response.ok) throw new Error('Failed to send command');
      
      console.log(`✅ Command sent: ${type}`);
      
      // Refresh display data after command
      setTimeout(fetchDisplayData, 1000);
    } catch (err) {
      console.error('Error sending command:', err);
      setError(err instanceof Error ? err.message : 'Failed to send command');
    }
  };

  // Create new playlist
  const createPlaylist = async (name: string, blocks: any[]) => {
    try {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayId,
          name,
          blocks
        })
      });
      
      if (!response.ok) throw new Error('Failed to create playlist');
      
      setShowPlaylistBuilder(false);
      fetchDisplayData();
    } catch (err) {
      console.error('Error creating playlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to create playlist');
    }
  };

  // Activate playlist
  const activatePlaylist = async (playlistId: string) => {
    try {
      const response = await fetch(`/api/playlists/${playlistId}/activate`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to activate playlist');
      
      fetchDisplayData();
    } catch (err) {
      console.error('Error activating playlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to activate playlist');
    }
  };

  // Delete playlist
  const deletePlaylist = async (playlistId: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    
    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete playlist');
      
      fetchDisplayData();
    } catch (err) {
      console.error('Error deleting playlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete playlist');
    }
  };

  useEffect(() => {
    fetchDisplayData();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchDisplayData, 5000);
    return () => clearInterval(interval);
  }, [displayId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading display...</div>
      </div>
    );
  }

  if (error || !display) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error || 'Display not found'}</div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (showPlaylistBuilder) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PlaylistBuilder
          onSave={createPlaylist}
          onCancel={() => setShowPlaylistBuilder(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin')}
                className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{display.name}</h1>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="font-mono">{display.id}</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${display.isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span>{display.isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => window.open(`/player/${display.id}`, '_blank')}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Display
              </button>
              <button
                onClick={() => setShowPlaylistBuilder(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Playlist
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Controls & Timeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Controls */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Playback Controls</h2>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => sendCommand('previous')}
                  disabled={!display.isOnline}
                  className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SkipBack className="w-5 h-5 text-gray-600" />
                </button>
                
                <button
                  onClick={() => sendCommand(display.status === 'playing' ? 'pause' : 'play')}
                  disabled={!display.isOnline}
                  className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {display.status === 'playing' ? 
                    <Pause className="w-5 h-5" /> : 
                    <Play className="w-5 h-5" />
                  }
                </button>
                
                <button
                  onClick={() => sendCommand('next')}
                  disabled={!display.isOnline}
                  className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SkipForward className="w-5 h-5 text-gray-600" />
                </button>
                
                <div className="w-px h-8 bg-gray-300"></div>
                
                <button
                  onClick={() => sendCommand('mute')}
                  disabled={!display.isOnline}
                  className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <VolumeX className="w-5 h-5 text-gray-600" />
                </button>
                
                <button
                  onClick={() => sendCommand('unmute')}
                  disabled={!display.isOnline}
                  className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Volume2 className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {!display.isOnline && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-yellow-800 text-sm">
                    Display is offline. Controls will be queued and executed when the display comes back online.
                  </div>
                </div>
              )}
            </div>

            {/* Timeline Progress */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline Progress</h2>
              <TimelineProgressComponent progress={display.progress} />
            </div>

            {/* Queue */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Upcoming Videos ({queuedVideos.length})
              </h2>
              
              {queuedVideos.length > 0 ? (
                <div className="space-y-3">
                  {queuedVideos.slice(0, 5).map((video, index) => {
                    const videoData = video.video_data ? JSON.parse(video.video_data) : null;
                    return (
                      <div key={video.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="text-sm font-medium text-gray-500 w-8">
                          #{index + 1}
                        </div>
                        {videoData && (
                          <>
                            <img
                              src={videoData.post.attachments?.[0]?.encodings?.thumbnail?.path}
                              alt="Thumbnail"
                              className="w-16 h-12 object-cover rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                @{videoData.profile.username}
                              </div>
                              <div className="text-xs text-gray-600 truncate">
                                {videoData.post.text || 'No description'}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  
                  {queuedVideos.length > 5 && (
                    <div className="text-sm text-gray-500 text-center">
                      ... and {queuedVideos.length - 5} more videos
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No videos in queue. Assign a playlist to start playing videos.
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Playlists */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Playlists</h2>
              
              {playlists.length > 0 ? (
                <div className="space-y-3">
                  {playlists.map((playlist) => (
                    <div 
                      key={playlist.id} 
                      className={`p-4 border rounded-lg ${
                        activePlaylist?.id === playlist.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">{playlist.name}</div>
                        {activePlaylist?.id === playlist.id && (
                          <div className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                            Active
                          </div>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-3">
                        {playlist.total_blocks} blocks • {playlist.total_videos} videos • Loop #{playlist.loop_count + 1}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {activePlaylist?.id !== playlist.id && (
                          <button
                            onClick={() => activatePlaylist(playlist.id)}
                            className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          >
                            Activate
                          </button>
                        )}
                        
                        <button
                          onClick={() => deletePlaylist(playlist.id)}
                          className="text-xs px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-500 mb-4">No playlists created yet</div>
                  <button
                    onClick={() => setShowPlaylistBuilder(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create First Playlist
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
