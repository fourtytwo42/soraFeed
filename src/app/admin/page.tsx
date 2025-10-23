'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Monitor, Play, Pause, SkipForward, Volume2, VolumeX, Settings, Eye, List, Trash2, ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { Display, TimelineProgress, BlockDefinition } from '@/types/timeline';
import PlaylistBuilder from '@/components/admin/PlaylistBuilder';
import TimelineProgressComponent from '@/components/admin/TimelineProgress';
import { useAdminWebSocket } from '@/hooks/useAdminWebSocket';

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
  const [showAddExistingModal, setShowAddExistingModal] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newDisplayCode, setNewDisplayCode] = useState('');
  const [existingDisplayCode, setExistingDisplayCode] = useState('');
  const [showPlaylistBuilder, setShowPlaylistBuilder] = useState(false);
  const [selectedDisplayForPlaylist, setSelectedDisplayForPlaylist] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [displayToDelete, setDisplayToDelete] = useState<DisplayWithProgress | null>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  // Generate a unique admin ID for this session (client-side only)
  const adminId = useMemo(() => {
    if (typeof window === 'undefined') return ''; // SSR guard
    
    const stored = localStorage.getItem('sorafeed-admin-id');
    if (stored) return stored;
    
    const newId = `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('sorafeed-admin-id', newId);
    return newId;
  }, []);

  // Initialize WebSocket connection
  const { isConnected: wsConnected, displayStatuses, registerDisplays, requestDisplayStatus } = useAdminWebSocket(adminId);

  // Get owned display codes from localStorage
  const getOwnedDisplayCodes = (): string[] => {
    try {
      const stored = localStorage.getItem('sorafeed-owned-displays');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  // Add display code to owned list in localStorage
  const addOwnedDisplayCode = (code: string) => {
    const owned = getOwnedDisplayCodes();
    if (!owned.includes(code)) {
      owned.push(code);
      localStorage.setItem('sorafeed-owned-displays', JSON.stringify(owned));
    }
  };

  // Remove display code from owned list in localStorage
  const removeOwnedDisplayCode = (code: string) => {
    const owned = getOwnedDisplayCodes();
    const updated = owned.filter(c => c !== code);
    localStorage.setItem('sorafeed-owned-displays', JSON.stringify(updated));
  };

  // Fetch displays and their status (only owned displays)
  const fetchDisplays = async () => {
    try {
      const ownedCodes = getOwnedDisplayCodes();
      if (ownedCodes.length === 0) {
        setDisplays([]);
        setStats({ total: 0, online: 0, playing: 0 });
        setLoading(false);
        return;
      }

      // Note: Display registration is handled in the WebSocket connection useEffect

      // Fetch each owned display individually with progress
      const displayPromises = ownedCodes.map(async (code) => {
        try {
          const [displayResponse, timelineResponse] = await Promise.all([
            fetch(`/api/displays/${code}`),
            fetch(`/api/timeline/${code}`)
          ]);
          
          if (displayResponse.ok) {
            const display = await displayResponse.json();
            
            // Get WebSocket status if available
            const wsStatus = displayStatuses.get(display.id);
            let isOnline = false;
            
            if (wsStatus) {
              isOnline = wsStatus.isConnected;
              if (wsStatus.currentVideo) {
                display.status = 'playing';
              }
            } else {
              // Fallback to last_ping check
              isOnline = display.last_ping ? (Date.now() - new Date(display.last_ping).getTime()) < 10000 : false;
            }
            
            // Get timeline progress
            let progress = null;
            if (wsStatus?.playlistProgress) {
              // Use WebSocket progress data
              progress = {
                currentBlock: {
                  name: wsStatus.playlistProgress.playlistName,
                  progress: (wsStatus.playlistProgress.currentIndex / wsStatus.playlistProgress.totalVideos) * 100,
                  currentVideo: wsStatus.playlistProgress.currentIndex + 1,
                  totalVideos: wsStatus.playlistProgress.totalVideos
                },
                blocks: [],
                overallProgress: {
                  currentPosition: wsStatus.playlistProgress.currentIndex,
                  totalInCurrentLoop: wsStatus.playlistProgress.totalVideos,
                  loopCount: 0
                }
              };
            } else if (timelineResponse.ok) {
              // Fallback to API progress
              const timelineData = await timelineResponse.json();
              progress = timelineData.progress;
            }
            
            return { ...display, isOnline, progress };
          } else if (displayResponse.status === 404) {
            // Display was deleted, remove from owned list
            removeOwnedDisplayCode(code);
            return null;
          }
        } catch (error) {
          console.error(`Error fetching display ${code}:`, error);
          return null;
        }
      });

      const results = await Promise.all(displayPromises);
      const validDisplays = results.filter(d => d !== null) as DisplayWithProgress[];
      
      setDisplays(validDisplays);

      // Calculate stats
      const total = validDisplays.length;
      const online = validDisplays.filter(d => d.isOnline).length;
      const playing = validDisplays.filter(d => d.status === 'playing').length;
      setStats({ total, online, playing });
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
        if (response.status === 409) {
          throw new Error(`Display code ${newDisplayCode.trim().toUpperCase()} already exists. Please use a different code or add the existing display instead.`);
        }
        throw new Error(errorData.error || 'Failed to create display');
      }
      
      // Add the display code to this admin's owned list
      addOwnedDisplayCode(newDisplayCode.trim().toUpperCase());
      
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

  // Add existing display by code
  const addExistingDisplay = async () => {
    if (!existingDisplayCode.trim()) {
      setError('Please enter a display code');
      return;
    }

    const code = existingDisplayCode.trim().toUpperCase();
    
    // Check if already owned
    if (getOwnedDisplayCodes().includes(code)) {
      setError('You already have access to this display');
      return;
    }

    try {
      // Try to fetch the display to verify it exists
      const response = await fetch(`/api/displays/${code}`);
      
      if (response.status === 404) {
        setError('Display code not found. Make sure the code is correct and the VM is running.');
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to verify display code');
      }

      const display = await response.json();
      
      // Add the display code to this admin's owned list
      addOwnedDisplayCode(code);
      
      setExistingDisplayCode('');
      setShowAddExistingModal(false);
      setError(null);
      fetchDisplays();
      
      console.log(`✅ Added existing display: ${display.name} (${code})`);
    } catch (err) {
      console.error('Error adding existing display:', err);
      setError(err instanceof Error ? err.message : 'Failed to add display');
    }
  };

  // Create playlist for display
  const createPlaylist = async (name: string, blocks: BlockDefinition[]) => {
    if (!selectedDisplayForPlaylist) return;
    
    console.log('Creating playlist with data:', {
      displayId: selectedDisplayForPlaylist,
      name,
      blocks
    });
    
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
        console.error('Playlist creation failed:', errorData);
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

  // Delete display
  const deleteDisplay = async () => {
    if (!displayToDelete) return;
    
    try {
      const response = await fetch(`/api/displays/${displayToDelete.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete display');
      }
      
      // Remove the display code from this admin's owned list
      removeOwnedDisplayCode(displayToDelete.id);
      
      setShowDeleteModal(false);
      setDisplayToDelete(null);
      setError(null);
      fetchDisplays();
      
      console.log(`✅ Display ${displayToDelete.name} (${displayToDelete.id}) deleted successfully`);
    } catch (err) {
      console.error('Error deleting display:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete display');
    }
  };

  useEffect(() => {
    fetchDisplays();
    
    // Refresh every 30 seconds (less frequent since WebSocket provides real-time updates)
    const interval = setInterval(fetchDisplays, 30000);
    return () => clearInterval(interval);
  }, [wsConnected, displayStatuses]);

  // Register displays when WebSocket connects (only once per connection)
  useEffect(() => {
    if (wsConnected) {
      const ownedCodes = getOwnedDisplayCodes();
      if (ownedCodes.length > 0) {
        console.log('🔌 Registering displays with WebSocket:', ownedCodes);
        registerDisplays(ownedCodes);
      }
    }
  }, [wsConnected, registerDisplays]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAddDropdown) {
        setShowAddDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddDropdown]);

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
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-gray-900">SoraFeed Admin</h1>
                  <div className="flex items-center gap-2">
                    {wsConnected ? (
                      <Wifi className="w-5 h-5 text-green-500" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-red-500" />
                    )}
                    <span className={`text-sm font-medium ${wsConnected ? 'text-green-600' : 'text-red-600'}`}>
                      {wsConnected ? 'Live' : 'Offline'}
                    </span>
                  </div>
                </div>
                <p className="text-gray-600">Manage your personal video displays and playlists</p>
                <p className="text-sm text-gray-500 mt-1">
                  You can only see displays that you've added to this browser
                </p>
              </div>
            <div className="relative">
              <button
                onClick={() => setShowAddDropdown(!showAddDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Display
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showAddDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowCreateModal(true);
                        setShowAddDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Plus className="w-4 h-4 text-blue-600" />
                      <div>
                        <div className="font-medium">Create New Display</div>
                        <div className="text-sm text-gray-500">Set up a new VM display</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setShowAddExistingModal(true);
                        setShowAddDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Monitor className="w-4 h-4 text-green-600" />
                      <div>
                        <div className="font-medium">Add Existing Display</div>
                        <div className="text-sm text-gray-500">Add a display from another device</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
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

              {/* Current Video Info */}
              {(() => {
                const wsStatus = displayStatuses.get(display.id);
                return wsStatus?.currentVideo ? (
                  <div className="p-4 bg-blue-50 border-l-4 border-blue-400">
                    <div className="text-sm font-medium text-blue-900 mb-1">Now Playing</div>
                    <div className="text-sm text-blue-800">
                      <div className="font-medium">@{wsStatus.currentVideo.username}</div>
                      <div className="text-xs text-blue-600 mt-1 line-clamp-2">
                        {wsStatus.currentVideo.description}
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}

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
                        
                        <button
                          onClick={() => {
                            setDisplayToDelete(display);
                            setShowDeleteModal(true);
                          }}
                          className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                          title="Delete Display"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
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
                <h3 className="text-lg font-medium text-gray-900 mb-2">No displays added yet</h3>
                <div className="text-gray-600 mb-6 space-y-2">
                  <p>You can only see and control displays that you've personally added.</p>
                  <div className="text-sm space-y-1 mt-4">
                    <p><strong>Get started:</strong></p>
                    <p>1. Open <code className="bg-gray-100 px-2 py-1 rounded">/player</code> on a VM to get a code</p>
                    <p>2. Add the display here with that code</p>
                    <p>3. Create a playlist with video blocks to start playing</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                    <p className="text-sm text-blue-800">
                      <strong>Privacy:</strong> Each admin client manages their own displays independently. 
                      Other admins cannot see or control your displays.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create New Display
                  </button>
                  <button
                    onClick={() => setShowAddExistingModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Add Existing Display
                  </button>
                </div>
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-gray-900 bg-white"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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

          {/* Add Existing Display Modal */}
          {showAddExistingModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                    <Monitor className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Add Existing Display</h3>
                    <p className="text-sm text-gray-500">Add a display from another device</p>
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Display Code
                  </label>
                  <input
                    type="text"
                    placeholder="Enter 6-digit code (e.g., ABC123)"
                    value={existingDisplayCode}
                    onChange={(e) => setExistingDisplayCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-gray-900 bg-white"
                    maxLength={6}
                    onKeyPress={(e) => e.key === 'Enter' && addExistingDisplay()}
                  />
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                    <p className="text-sm text-blue-800">
                      <strong>Cross-device management:</strong> Enter a display code from another admin client 
                      to manage it from this device. Both devices will have full control.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowAddExistingModal(false);
                      setExistingDisplayCode('');
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addExistingDisplay}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    disabled={!existingDisplayCode.trim()}
                  >
                    Add Display
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Display Modal */}
          {showDeleteModal && displayToDelete && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Delete Display</h3>
                    <p className="text-sm text-gray-500">This action cannot be undone</p>
                  </div>
                </div>
                
                <div className="mb-6">
                  <p className="text-gray-700 mb-2">
                    Are you sure you want to delete <strong>{displayToDelete.name}</strong>?
                  </p>
                  <p className="text-sm text-gray-500 mb-2">
                    Code: <code className="bg-gray-100 px-2 py-1 rounded font-mono">{displayToDelete.id}</code>
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      <strong>This will permanently delete:</strong>
                    </p>
                    <ul className="text-sm text-yellow-700 mt-1 ml-4 list-disc">
                      <li>The display configuration</li>
                      <li>All associated playlists</li>
                      <li>Video timeline and history</li>
                    </ul>
                    <p className="text-sm text-yellow-800 mt-2">
                      The VM client will revert to showing its code and can be re-added later.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDisplayToDelete(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={deleteDisplay}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Delete Display
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
}
