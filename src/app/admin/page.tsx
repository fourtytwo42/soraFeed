'use client';

import { useState, useEffect } from 'react';
import { Plus, Monitor, Play, Pause, SkipForward, Volume2, VolumeX, Settings, Eye, List } from 'lucide-react';
import { Display, TimelineProgress, BlockDefinition } from '@/types/timeline';
import PlaylistBuilder from '@/components/admin/PlaylistBuilder';
import TimelineProgressComponent from '@/components/admin/TimelineProgress';

interface DisplayWithProgress extends Display {
  isOnline: boolean;
  progress?: TimelineProgress;
}

interface DashboardStats {
  total: number;
  online: number;
  playing: number;
}

export default function AdminDashboard() {
  const [displays, setDisplays] = useState<DisplayWithProgress[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ total: 0, online: 0, playing: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newDisplayCode, setNewDisplayCode] = useState('');
  const [showPlaylistBuilder, setShowPlaylistBuilder] = useState(false);
  const [selectedDisplayForPlaylist, setSelectedDisplayForPlaylist] = useState<string | null>(null);

  // Fetch displays and their status
  const fetchDisplays = async () => {
    try {
      const response = await fetch('/api/displays');
      if (!response.ok) throw new Error('Failed to fetch displays');
      
      const data = await response.json();
      setStats(data.stats);
      
      // Fetch progress for each display
      const displaysWithProgress = await Promise.all(
        data.displays.map(async (display: Display) => {
          try {
            const progressResponse = await fetch(`/api/poll/${display.id}`);
            if (progressResponse.ok) {
              const progressData = await progressResponse.json();
              return {
                ...display,
                isOnline: progressData.display.isOnline,
                progress: progressData.progress
              };
            }
          } catch (err) {
            console.error('Failed to fetch progress for display:', display.id);
          }
          
          return {
            ...display,
            isOnline: false
          };
        })
      );
      
      setDisplays(displaysWithProgress);
      setError(null);
    } catch (err) {
      console.error('Error fetching displays:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch displays');
    } finally {
      setLoading(false);
    }
  };

  // Create new display
  const createDisplay = async () => {
    if (!newDisplayName.trim() || !newDisplayCode.trim()) {
      setError('Please enter both display name and code');
      return;
    }
    
    try {
      const response = await fetch('/api/displays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: newDisplayName.trim(),
          code: newDisplayCode.trim().toUpperCase()
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create display');
      }
      
      setNewDisplayName('');
      setNewDisplayCode('');
      setShowCreateModal(false);
      setError(null);
      fetchDisplays();
    } catch (err) {
      console.error('Error creating display:', err);
      setError(err instanceof Error ? err.message : 'Failed to create display');
    }
  };

  // Create playlist for display
  const createPlaylist = async (name: string, blocks: BlockDefinition[]) => {
    if (!selectedDisplayForPlaylist) return;
    
    try {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayId: selectedDisplayForPlaylist,
          name,
          blocks
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create playlist');
      }
      
      // Activate the playlist immediately
      const playlist = await response.json();
      await fetch(`/api/playlists/${playlist.id}/activate`, {
        method: 'POST'
      });
      
      setShowPlaylistBuilder(false);
      setSelectedDisplayForPlaylist(null);
      setError(null);
      fetchDisplays();
      
      console.log(`✅ Playlist "${name}" created and activated for display ${selectedDisplayForPlaylist}`);
    } catch (err) {
      console.error('Error creating playlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to create playlist');
    }
  };

  // Send command to display
  const sendCommand = async (displayId: string, type: string, payload?: any) => {
    try {
      const response = await fetch(`/api/displays/${displayId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, payload })
      });
      
      if (!response.ok) throw new Error('Failed to send command');
      
      console.log(`✅ Command sent: ${type} to ${displayId}`);
    } catch (err) {
      console.error('Error sending command:', err);
      setError(err instanceof Error ? err.message : 'Failed to send command');
    }
  };

  useEffect(() => {
    fetchDisplays();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchDisplays, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl text-gray-600">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (showPlaylistBuilder) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PlaylistBuilder
          onSave={createPlaylist}
          onCancel={() => {
            setShowPlaylistBuilder(false);
            setSelectedDisplayForPlaylist(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">SoraFeed Admin</h1>
              <p className="text-gray-600">Manage your video displays and playlists</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Display
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Monitor className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-gray-600">Total Displays</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{stats.online}</div>
                <div className="text-gray-600">Online</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Play className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{stats.playing}</div>
                <div className="text-gray-600">Playing</div>
              </div>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-800">{error}</div>
          </div>
        )}

        {/* Displays Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {displays.map((display) => (
            <div key={display.id} className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-200">
              {/* Display Header */}
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{display.name}</h3>
                    <div className="text-sm text-gray-500 font-mono">{display.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${display.isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-sm text-gray-600">
                      {display.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeline Progress */}
              {display.progress ? (
                <div className="p-4 bg-gray-50">
                  <TimelineProgressComponent progress={display.progress} className="mb-0" />
                </div>
              ) : display.isOnline && (
                <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400">
                  <div className="text-sm text-yellow-800">
                    Display is online but no playlist assigned
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => sendCommand(display.id, display.status === 'playing' ? 'pause' : 'play')}
                      className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                      disabled={!display.isOnline}
                    >
                      {display.status === 'playing' ? 
                        <Pause className="w-4 h-4 text-blue-600" /> : 
                        <Play className="w-4 h-4 text-blue-600" />
                      }
                    </button>
                    
                    <button
                      onClick={() => sendCommand(display.id, 'next')}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      disabled={!display.isOnline}
                    >
                      <SkipForward className="w-4 h-4 text-gray-600" />
                    </button>
                    
                    <button
                      onClick={() => sendCommand(display.id, 'mute')}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      disabled={!display.isOnline}
                    >
                      <VolumeX className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedDisplayForPlaylist(display.id);
                        setShowPlaylistBuilder(true);
                      }}
                      className="p-2 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                      title="Create Playlist"
                    >
                      <List className="w-4 h-4 text-purple-600" />
                    </button>
                    
                    <button
                      onClick={() => window.open(`/player/${display.id}`, '_blank')}
                      className="p-2 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                      title="View Display"
                    >
                      <Eye className="w-4 h-4 text-green-600" />
                    </button>
                    
                    <button 
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      title="Display Settings"
                    >
                      <Settings className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {displays.length === 0 && (
          <div className="text-center py-12">
            <Monitor className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No displays yet</h3>
            <div className="text-gray-600 mb-6 space-y-2">
              <p>Get started in 3 steps:</p>
              <div className="text-sm space-y-1">
                <p>1. Open <code className="bg-gray-100 px-2 py-1 rounded">/player</code> on a VM to get a code</p>
                <p>2. Add the display here with that code</p>
                <p>3. Create a playlist with video blocks to start playing</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Display
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-gray-200 mt-12">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div>
            SoraFeed Admin • Dual-sided video display management
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Scanner Active</span>
            </div>
            <div>Auto-refresh: 5s</div>
          </div>
        </div>
      </footer>

      {/* Create Display Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Display</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Code
                </label>
                <input
                  type="text"
                  placeholder="Enter 6-digit code from VM (e.g., ABC123)"
                  value={newDisplayCode}
                  onChange={(e) => setNewDisplayCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  maxLength={6}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Get this code from the VM display screen
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="Display name (e.g., Living Room TV)"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && createDisplay()}
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewDisplayName('');
                  setNewDisplayCode('');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createDisplay}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={!newDisplayName.trim() || !newDisplayCode.trim()}
              >
                Add Display
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
