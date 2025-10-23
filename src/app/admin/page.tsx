'use client';

import { useState, useEffect } from 'react';
import { Plus, Monitor, Play, Pause, SkipForward, Volume2, VolumeX, Settings, Eye } from 'lucide-react';
import { Display, TimelineProgress } from '@/types/timeline';

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
    if (!newDisplayName.trim()) return;
    
    try {
      const response = await fetch('/api/displays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newDisplayName.trim() })
      });
      
      if (!response.ok) throw new Error('Failed to create display');
      
      setNewDisplayName('');
      setShowCreateModal(false);
      fetchDisplays();
    } catch (err) {
      console.error('Error creating display:', err);
      setError(err instanceof Error ? err.message : 'Failed to create display');
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
        <div className="text-xl text-gray-600">Loading dashboard...</div>
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
            <div key={display.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
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
              {display.progress && (
                <div className="p-4 bg-gray-50">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Current: {display.progress.currentBlock.name}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${display.progress.currentBlock.progress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Video {display.progress.currentBlock.currentVideo} of {display.progress.currentBlock.totalVideos} • 
                    Loop #{display.progress.overallProgress.loopCount + 1}
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
                      onClick={() => window.open(`/player/${display.id}`, '_blank')}
                      className="p-2 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4 text-green-600" />
                    </button>
                    
                    <button className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
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
            <p className="text-gray-600 mb-6">Create your first display to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Display
            </button>
          </div>
        )}
      </div>

      {/* Create Display Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Create New Display</h3>
            <input
              type="text"
              placeholder="Display name (e.g., Living Room TV)"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              onKeyPress={(e) => e.key === 'Enter' && createDisplay()}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createDisplay}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={!newDisplayName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
