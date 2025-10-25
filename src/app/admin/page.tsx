'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Monitor, Play, Pause, SkipForward, Volume2, VolumeX, Settings, Eye, 
  List, Trash2, ChevronDown, Wifi, WifiOff, Edit3, Save, X, GripVertical,
  BarChart3, Clock, Users, Zap, MoreVertical, Copy, RefreshCw, ChevronRight
} from 'lucide-react';
import { Display, TimelineProgress, BlockDefinition } from '@/types/timeline';
import { useAdminWebSocket } from '@/hooks/useAdminWebSocket';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DisplayWithProgress extends Display {
  isOnline: boolean;
  progress?: TimelineProgress;
  queuedVideos?: any[];
}

interface DashboardStats {
  total: number;
  online: number;
  playing: number;
}

// Sortable Block Component
function SortableBlock({ block, isActive, isCompleted, onEdit, onDelete }: {
  block: any;
  isActive: boolean;
  isCompleted: boolean;
  onEdit: (block: any) => void;
  onDelete: (block: any) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Calculate database progress percentage
  const dbProgress = block.totalAvailable && block.totalAvailable > 0 
    ? ((block.seenCount || 0) / block.totalAvailable) * 100 
    : 0;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`relative group bg-white rounded-lg border transition-all duration-200 ${
        isActive ? 'border-blue-400 shadow-md shadow-blue-100' : 
        isCompleted ? 'border-green-300 bg-green-50/50' : 
        'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1"
      >
        <GripVertical className="w-3 h-3 text-gray-400" />
      </div>

      <div className="p-3 pl-6">
        {/* Block Header - Compact */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isActive ? 'bg-blue-500 animate-pulse' : 
              isCompleted ? 'bg-green-500' : 
              'bg-gray-300'
            }`} />
            <h3 className="font-medium text-gray-900 truncate text-sm">{block.name}</h3>
            <span className={`px-1.5 py-0.5 text-xs rounded-full flex-shrink-0 ${
              block.format === 'wide' ? 'bg-blue-100 text-blue-700' :
              block.format === 'tall' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {block.format || 'mixed'}
            </span>
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(block)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Edit Block"
            >
              <Edit3 className="w-3 h-3 text-gray-600" />
            </button>
            <button
              onClick={() => onDelete(block)}
              className="p-1 hover:bg-red-100 rounded transition-colors"
              title="Delete Block"
            >
              <Trash2 className="w-3 h-3 text-red-600" />
            </button>
          </div>
        </div>

        {/* Progress Bar - Full Width */}
        {isActive && (
          <div className="mb-2">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Video {block.currentVideo || 1} of {block.totalVideos || block.videoCount}</span>
              <span>{Math.round(block.progress || 0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <motion.div
                className="bg-blue-500 h-1.5 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${block.progress || 0}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        {/* Stats Row - Compact */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="text-gray-600">
              <span className="font-medium text-gray-900">{block.videoCount}</span> videos
            </span>
            <span className="text-gray-600">
              Played <span className="font-medium text-gray-900">{block.timesPlayed || 0}</span> times
            </span>
          </div>
          
          {/* Database Stats - Compact */}
          {block.totalAvailable && block.totalAvailable > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600">
                DB: <span className="font-medium text-gray-900">{block.seenCount || 0}/{block.totalAvailable}</span>
              </span>
              <div className="w-12 bg-gray-200 rounded-full h-1">
                <div 
                  className="bg-green-500 h-1 rounded-full"
                  style={{ width: `${dbProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Inline Block Editor Component
function BlockEditor({ block, onSave, onCancel }: {
  block: any;
  onSave: (block: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: block.name || '',
    searchTerm: block.search_term || '',
    videoCount: block.video_count || 10,
    format: block.format || 'mixed'
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-blue-50 rounded-lg border-2 border-blue-400 shadow-md p-3"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 text-sm">Edit Block</h3>
        <div className="flex gap-1">
          <button
            onClick={() => onSave(formData)}
            className="p-1.5 bg-green-100 hover:bg-green-200 rounded transition-colors"
            title="Save Changes"
          >
            <Save className="w-3 h-3 text-green-600" />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Cancel"
          >
            <X className="w-3 h-3 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Block name"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Videos</label>
            <input
              type="number"
              value={formData.videoCount}
              onChange={(e) => setFormData({ ...formData, videoCount: parseInt(e.target.value) || 10 })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              min="1"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Search Term</label>
          <input
            type="text"
            value={formData.searchTerm}
            onChange={(e) => setFormData({ ...formData, searchTerm: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="e.g., 'cute cats -dogs'"
          />
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Format</label>
          <select
            value={formData.format}
            onChange={(e) => setFormData({ ...formData, format: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="mixed">Mixed</option>
            <option value="wide">Wide</option>
            <option value="tall">Tall</option>
          </select>
        </div>
      </div>
    </motion.div>
  );
}

// Add Block Form Component
function AddBlockForm({ onSave, onCancel }: {
  onSave: (blockData: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    searchTerm: '',
    videoCount: 10,
    format: 'mixed'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim() && formData.searchTerm.trim()) {
      onSave(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Block Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="e.g., Music Videos"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search Term
        </label>
        <input
          type="text"
          value={formData.searchTerm}
          onChange={(e) => setFormData({ ...formData, searchTerm: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="e.g., 'music video -live'"
          required
        />
        <div className="text-xs text-gray-500 mt-1">
          Use -word to exclude terms (e.g., 'cats -dogs')
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Video Count
          </label>
          <input
            type="number"
            value={formData.videoCount}
            onChange={(e) => setFormData({ ...formData, videoCount: parseInt(e.target.value) || 10 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            min="1"
            max="100"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Format
          </label>
          <select
            value={formData.format}
            onChange={(e) => setFormData({ ...formData, format: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="mixed">Mixed</option>
            <option value="wide">Wide (Landscape)</option>
            <option value="tall">Tall (Portrait)</option>
          </select>
        </div>
      </div>
      
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-200"
          disabled={!formData.name.trim() || !formData.searchTerm.trim()}
        >
          Add Block
        </button>
      </div>
    </form>
  );
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [displayToDelete, setDisplayToDelete] = useState<DisplayWithProgress | null>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [selectedDisplay, setSelectedDisplay] = useState<DisplayWithProgress | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({});
  const [showAddBlockModal, setShowAddBlockModal] = useState(false);
  const [selectedDisplayForBlock, setSelectedDisplayForBlock] = useState<string | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
  
  // Track previous video IDs to detect changes
  const previousVideoIdsRef = useRef<Map<string, string>>(new Map());

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
            
            // Get timeline progress - prioritize API data for consistency
            let progress = null;
            let queuedVideos = [];
            if (timelineResponse.ok) {
              // Use API progress data as primary source
              const timelineData = await timelineResponse.json();
              progress = timelineData.progress;
              queuedVideos = timelineData.queuedVideos || [];
              
              // Enhance with WebSocket video progress if available
              if (wsStatus?.playlistProgress?.videoProgress && progress) {
                // Use the API-calculated position as the source of truth, not WebSocket blockPosition
                // The API already calculated the correct position within the current block
                const currentVideoInBlock = progress.currentBlock.currentVideo; // This is already correct from API
                const videoProgressFraction = (wsStatus.playlistProgress.videoProgress || 0) / 100;
                const totalVideosInBlock = progress.currentBlock.totalVideos;
                
                // Calculate smooth progress: (current video - 1 + video progress) / total videos
                // Subtract 1 because currentVideo is 1-based, but we need 0-based for calculation
                const smoothBlockProgress = (((currentVideoInBlock - 1) + videoProgressFraction) / totalVideosInBlock) * 100;
                
                progress.currentBlock.progress = Math.min(smoothBlockProgress, 100);
                // Keep the API-calculated currentVideo as it's already correct
              }
            }
            
            return { ...display, isOnline, progress, queuedVideos };
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
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `HTTP ${response.status}`;
        console.error(`❌ Command failed: ${type} to ${displayId} - ${errorMsg}`);
        throw new Error(`Failed to send command: ${errorMsg}`);
      }
      
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

  // Handle drag end for playlist blocks
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    
    if (active.id !== over.id && selectedDisplay?.progress) {
      // Extract index from the unique key format "name-index"
      const activeIndex = parseInt(active.id.split('-').pop() || '0');
      const overIndex = parseInt(over.id.split('-').pop() || '0');
      
      if (activeIndex !== -1 && overIndex !== -1) {
        const newBlocks = arrayMove(selectedDisplay.progress.blocks, activeIndex, overIndex);
        
        setSelectedDisplay({
          ...selectedDisplay,
          progress: {
            ...selectedDisplay.progress,
            blocks: newBlocks
          }
        });
        
        // TODO: Save the new order to the server
        console.log('New block order:', newBlocks.map((b: any, index: number) => `${index}: ${b.name}`));
      }
    }
  };

  // Handle block edit
  const handleBlockEdit = (block: any, blockIndex: number) => {
    setEditingBlock({ ...block, blockIndex });
  };

  // Handle block save
  const handleBlockSave = (updatedBlock: any) => {
    if (selectedDisplay?.progress && editingBlock?.blockIndex !== undefined) {
      const newBlocks = selectedDisplay.progress.blocks.map((block: any, index: number) => 
        index === editingBlock.blockIndex ? { ...block, ...updatedBlock } : block
      );
      
      setSelectedDisplay({
        ...selectedDisplay,
        progress: {
          ...selectedDisplay.progress,
          blocks: newBlocks
        }
      });
      
      // TODO: Save to server
      console.log('Updated block:', updatedBlock);
    }
    
    setEditingBlock(null);
  };

  // Handle block delete
  const handleBlockDelete = (block: any, blockIndex: number) => {
    if (selectedDisplay?.progress) {
      const newBlocks = selectedDisplay.progress.blocks.filter((b: any, index: number) => index !== blockIndex);
      
      setSelectedDisplay({
        ...selectedDisplay,
        progress: {
          ...selectedDisplay.progress,
          blocks: newBlocks
        }
      });
      
      // TODO: Save to server
      console.log('Deleted block:', block.name, 'at index:', editingBlock.blockIndex);
    }
  };

  // Handle adding new block
  const handleAddBlock = (displayId: string) => {
    setSelectedDisplayForBlock(displayId);
    setShowAddBlockModal(true);
  };

  // Handle saving new block
  const handleSaveNewBlock = async (blockData: any) => {
    if (!selectedDisplayForBlock) return;
    
    try {
      // TODO: Implement API call to add block to playlist
      console.log('Adding new block:', blockData, 'to display:', selectedDisplayForBlock);
      
      // For now, just close the modal
      setShowAddBlockModal(false);
      setSelectedDisplayForBlock(null);
      
      // Refresh displays to get updated data
      fetchDisplays();
    } catch (err) {
      console.error('Error adding block:', err);
      setError(err instanceof Error ? err.message : 'Failed to add block');
    }
  };

  // Toggle section expansion
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  useEffect(() => {
    fetchDisplays();
    
    // Refresh every 30 seconds (less frequent since WebSocket provides real-time updates)
    const interval = setInterval(fetchDisplays, 30000);
    return () => clearInterval(interval);
  }, [wsConnected]);

  // Update displays when WebSocket status changes
  useEffect(() => {
    if (displays.length > 0 && wsConnected) {
      setDisplays(prevDisplays => 
        prevDisplays.map(display => {
          const wsStatus = displayStatuses.get(display.id);
          if (wsStatus) {
            let updatedDisplay = { ...display };
            
            // Update online status
            updatedDisplay.isOnline = wsStatus.isConnected;
            
            // Update playing status
            if (wsStatus.currentVideo) {
              updatedDisplay.status = 'playing';
            }
            
            // Update progress with WebSocket video progress (smooth block progression)
            if (wsStatus.playlistProgress?.videoProgress && display.progress) {
              // Use the existing API-calculated position as the source of truth
              const currentVideoInBlock = display.progress.currentBlock.currentVideo; // Already correct from API
              const videoProgressFraction = (wsStatus.playlistProgress.videoProgress || 0) / 100;
              const totalVideosInBlock = display.progress.currentBlock.totalVideos;
              
              // Calculate smooth progress: (current video - 1 + video progress) / total videos
              // Subtract 1 because currentVideo is 1-based, but we need 0-based for calculation
              const smoothBlockProgress = (((currentVideoInBlock - 1) + videoProgressFraction) / totalVideosInBlock) * 100;
              
              updatedDisplay.progress = {
                ...display.progress,
                currentBlock: {
                  ...display.progress.currentBlock,
                  progress: Math.min(smoothBlockProgress, 100)
                  // Keep the existing currentVideo as it's already correct from API
                }
              };
            }
            
            return updatedDisplay;
          }
          return display;
        })
      );
    }
  }, [displayStatuses, displays.length, wsConnected]);

  // Detect video changes and refresh display data from API
  useEffect(() => {
    displayStatuses.forEach((status, displayId) => {
      const currentVideoId = status.currentVideo?.id;
      const previousVideoId = previousVideoIdsRef.current.get(displayId);
      
      // If video changed, refresh display data from API to get updated position
      if (currentVideoId && previousVideoId && currentVideoId !== previousVideoId) {
        console.log(`🎬 Video changed for ${displayId}, refreshing display data...`);
        fetchDisplays();
      }
      
      // Update tracking
      if (currentVideoId) {
        previousVideoIdsRef.current.set(displayId, currentVideoId);
      }
    });
  }, [displayStatuses]);

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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl text-gray-600">Loading dashboard...</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Mobile-First Header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Monitor className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  SoraFeed Admin
                </h1>
                <div className="flex items-center gap-2">
                  {wsConnected ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${wsConnected ? 'text-green-600' : 'text-red-600'}`}>
                    {wsConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <button
                onClick={() => setShowAddDropdown(!showAddDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">Add Display</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showAddDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 z-50"
                >
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowCreateModal(true);
                        setShowAddDropdown(false);
                      }}
                      className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
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
                      className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    >
                      <Monitor className="w-4 h-4 text-green-600" />
                      <div>
                        <div className="font-medium">Add Existing Display</div>
                        <div className="text-sm text-gray-500">Add a display from another device</div>
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards - Mobile First */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Monitor className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-3">
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Displays</div>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <div className="ml-3">
                <div className="text-2xl font-bold text-gray-900">{stats.online}</div>
                <div className="text-sm text-gray-600">Online</div>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Play className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-3">
                <div className="text-2xl font-bold text-gray-900">{stats.playing}</div>
                <div className="text-sm text-gray-600">Playing</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl"
          >
            <div className="text-red-800">{error}</div>
          </motion.div>
        )}

        {/* Main Content - Mobile First Layout */}
        {displays.length === 0 ? (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Monitor className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No displays added yet</h3>
            <div className="text-gray-600 mb-8 max-w-md mx-auto">
              <p className="mb-4">You can only see and control displays that you've personally added.</p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                  <strong>Privacy:</strong> Each admin client manages their own displays independently. 
                  Other admins cannot see or control your displays.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg"
              >
                Create New Display
              </button>
              <button
                onClick={() => setShowAddExistingModal(true)}
                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Add Existing Display
              </button>
            </div>
          </motion.div>
        ) : (
          /* Displays Grid - Mobile First */
          <div className="space-y-6">
            {displays.map((display, index) => (
              <motion.div
                key={display.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
              >
                {/* Display Header */}
                <div className="p-4 sm:p-6 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <Monitor className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{display.name}</h3>
                        <div className="text-sm text-gray-500 font-mono">{display.id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${display.isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
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
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-blue-400">
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

                {/* Timeline Progress - Mobile Optimized */}
                {display.progress && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">Playlist Blocks</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAddBlock(display.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                          title="Add New Block"
                        >
                          <Plus className="w-3 h-3" />
                          Add Block
                        </button>
                        <button
                          onClick={() => toggleSection(`playlist-${display.id}`)}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {expandedSections[`playlist-${display.id}`] ? 'Collapse' : 'Expand'}
                          {expandedSections[`playlist-${display.id}`] ? 
                            <ChevronDown className="w-4 h-4" /> : 
                            <ChevronRight className="w-4 h-4" />
                          }
                        </button>
                      </div>
                    </div>
                    
                    {/* Overall Progress */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Overall Progress</span>
                        <span>{Math.round((display.progress.overallProgress.currentPosition / display.progress.overallProgress.totalInCurrentLoop) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <motion.div
                          className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(display.progress.overallProgress.currentPosition / display.progress.overallProgress.totalInCurrentLoop) * 100}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>

                    {/* Current Block */}
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-900 mb-2">
                        {display.progress.currentBlock.name}
                      </div>
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Video {display.progress.currentBlock.currentVideo} of {display.progress.currentBlock.totalVideos}</span>
                        <span>{Math.round(display.progress.currentBlock.progress)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <motion.div
                          className="bg-blue-500 h-1.5 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${display.progress.currentBlock.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>

                    {/* Detailed View - Collapsible */}
                    <AnimatePresence>
                      {expandedSections[`playlist-${display.id}`] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="mt-4"
                        >
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                          >
                            <SortableContext
                              items={display.progress.blocks.map((block: any, index: number) => `${block.name}-${index}`)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-3">
                                {display.progress.blocks.map((block: any, blockIndex: number) => (
                                  <div key={`${block.name}-${blockIndex}`}>
                                    {editingBlock?.blockIndex === blockIndex ? (
                                      <BlockEditor
                                        block={block}
                                        onSave={handleBlockSave}
                                        onCancel={() => setEditingBlock(null)}
                                      />
                                    ) : (
                                      <SortableBlock
                                        block={{
                                          ...block,
                                          id: `${block.name}-${blockIndex}`,
                                          isActive: block.isActive, // Use the isActive value from the API
                                          isCompleted: block.isCompleted, // Use the isCompleted value from the API
                                          currentVideo: block.isActive ? display.progress?.currentBlock?.currentVideo : undefined,
                                          totalVideos: block.videoCount,
                                          progress: block.isActive ? display.progress?.currentBlock?.progress : undefined
                                        }}
                                        isActive={block.isActive} // Use the isActive value from the API
                                        isCompleted={block.isCompleted} // Use the isCompleted value from the API
                                        onEdit={(block) => handleBlockEdit(block, blockIndex)}
                                        onDelete={(block) => handleBlockDelete(block, blockIndex)}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Upcoming Videos - Collapsible */}
                <div className="p-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">Upcoming Videos</h4>
                    <button
                      onClick={() => toggleSection(`upcoming-${display.id}`)}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {expandedSections[`upcoming-${display.id}`] ? 'Collapse' : 'Expand'}
                      {expandedSections[`upcoming-${display.id}`] ? 
                        <ChevronDown className="w-4 h-4" /> : 
                        <ChevronRight className="w-4 h-4" />
                      }
                    </button>
                  </div>
                  
                  <AnimatePresence>
                    {expandedSections[`upcoming-${display.id}`] && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-2"
                      >
                        {(() => {
                          // Get upcoming videos from display data (fetched from timeline API)
                          const upcomingVideos = display.queuedVideos || [];
                          
                          if (upcomingVideos.length === 0) {
                            return (
                              <div className="text-center py-8 text-gray-500">
                                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                                <p>No upcoming videos</p>
                              </div>
                            );
                          }
                          
                          return upcomingVideos.slice(0, 10).map((video: any, index: number) => {
                            // video_data is already parsed by the timeline API
                            const videoData = video.video_data;
                            
                            return (
                              <motion.div
                                key={video.id || index}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-sm font-medium text-blue-600">
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 truncate">
                                    @{videoData?.profile?.username || 'Unknown User'}
                                  </div>
                                  <div className="text-sm text-gray-600 truncate">
                                    {videoData?.post?.text || 'No description available'}
                                  </div>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {videoData?.post?.duration ? `${Math.round(videoData.post.duration)}s` : 'N/A'}
                                </div>
                              </motion.div>
                            );
                          });
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Controls - Mobile Optimized */}
                <div className="p-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => sendCommand(display.id, display.is_playing ? 'pause' : 'play')}
                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                        disabled={!display.isOnline}
                      >
                        {display.is_playing ? 
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

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => window.open(`/player/${display.id}`, '_blank')}
                        className="p-2 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                        title="View Display"
                      >
                        <Eye className="w-4 h-4 text-green-600" />
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
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 border-t border-gray-200 mt-12">
        <div className="flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 gap-4">
          <div>
            SoraFeed Admin • Dual-sided video display management
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Database Connected</span>
            </div>
            <div>Auto-refresh: 5s</div>
          </div>
        </div>
      </footer>

      {/* Modals remain the same but with updated styling */}
      {/* Create Display Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 w-full max-w-md"
          >
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
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
                disabled={!newDisplayName.trim() || !newDisplayCode.trim()}
              >
                Add Display
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Existing Display Modal */}
      {showAddExistingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 w-full max-w-md"
          >
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
                className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-200"
                disabled={!existingDisplayCode.trim()}
              >
                Add Display
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Display Modal */}
      {showDeleteModal && displayToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 w-full max-w-md"
          >
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
                className="flex-1 px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-lg hover:from-red-700 hover:to-pink-700 transition-all duration-200"
              >
                Delete Display
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Block Modal */}
      {showAddBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 w-full max-w-md"
          >
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <Plus className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Add New Block</h3>
                <p className="text-sm text-gray-500">Add a new video block to the playlist</p>
              </div>
            </div>
            
            <AddBlockForm
              onSave={handleSaveNewBlock}
              onCancel={() => {
                setShowAddBlockModal(false);
                setSelectedDisplayForBlock(null);
              }}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}