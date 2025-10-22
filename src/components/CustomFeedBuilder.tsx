'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { CustomFeed, CustomFeedBlock } from '@/types/customFeed';
import { X, Plus, GripVertical, Trash2, Copy, Save, Clock } from 'lucide-react';

interface CustomFeedBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (feed: CustomFeed) => void;
  editingFeed?: CustomFeed | null;
}

export default function CustomFeedBuilder({ isOpen, onClose, onSave, editingFeed }: CustomFeedBuilderProps) {
  const [feedName, setFeedName] = useState('');
  const [loop, setLoop] = useState(false);
  const [blocks, setBlocks] = useState<CustomFeedBlock[]>([]);
  const [availableBlocks, setAvailableBlocks] = useState<CustomFeedBlock[]>([]);
  const [newBlockSearch, setNewBlockSearch] = useState('');
  const [newBlockDuration, setNewBlockDuration] = useState(60); // Default 60 seconds (1 minute)
  const [durationUnit, setDurationUnit] = useState<'seconds' | 'minutes' | 'hours'>('seconds');
  const [draggedBlock, setDraggedBlock] = useState<CustomFeedBlock | null>(null);
  const [draggedFromTimeline, setDraggedFromTimeline] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showTrashZone, setShowTrashZone] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const trashZoneRef = useRef<HTMLDivElement>(null);

  // Initialize with editing feed data
  useEffect(() => {
    if (editingFeed) {
      setFeedName(editingFeed.name);
      setLoop(editingFeed.loop);
      setBlocks([...editingFeed.blocks].sort((a, b) => a.order - b.order));
      setAvailableBlocks([]);
    } else {
      setFeedName('');
      setLoop(false);
      setBlocks([]);
      setAvailableBlocks([]);
    }
  }, [editingFeed, isOpen]);

  // Use a counter to ensure absolutely unique IDs
  const idCounterRef = useRef(0);
  const generateId = () => {
    idCounterRef.current += 1;
    let newId;
    let attempts = 0;
    
    do {
      newId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${performance.now().toString(36)}_${idCounterRef.current}_${attempts}`;
      attempts++;
    } while (
      (blocks.some(b => b.id === newId) || availableBlocks.some(b => b.id === newId)) && 
      attempts < 10
    );
    
    return newId;
  };

  const createBlock = useCallback(() => {
    if (!newBlockSearch.trim()) return;

    // Convert duration to seconds and validate minimum
    let durationInSeconds = newBlockDuration;
    if (durationUnit === 'minutes') {
      durationInSeconds = newBlockDuration * 60;
    } else if (durationUnit === 'hours') {
      durationInSeconds = newBlockDuration * 3600;
    }

    // Ensure minimum 15 seconds and round to nearest 15 seconds
    durationInSeconds = Math.max(15, Math.round(durationInSeconds / 15) * 15);

    const block: CustomFeedBlock = {
      id: generateId(),
      searchQuery: newBlockSearch.trim(),
      durationSeconds: durationInSeconds,
      order: availableBlocks.length,
    };

    setAvailableBlocks(prev => [...prev, block]);
    setNewBlockSearch('');
    setNewBlockDuration(60); // Reset to 60 seconds
  }, [newBlockSearch, newBlockDuration, durationUnit, availableBlocks.length]);

  const duplicateBlock = useCallback((block: CustomFeedBlock, fromTimeline: boolean) => {
    const newBlock: CustomFeedBlock = {
      ...block,
      id: generateId(),
      order: fromTimeline ? blocks.length : availableBlocks.length,
    };

    if (fromTimeline) {
      setBlocks(prev => [...prev, newBlock]);
    } else {
      setAvailableBlocks(prev => [...prev, newBlock]);
    }
  }, [blocks.length, availableBlocks.length]);

  const removeBlockFromAvailable = useCallback((blockId: string) => {
    setAvailableBlocks(prev => prev.filter(b => b.id !== blockId));
  }, []);

  const removeBlockFromTimeline = useCallback((blockId: string) => {
    setBlocks(prev => {
      const filtered = prev.filter(b => b.id !== blockId);
      return filtered.map((b, idx) => ({ ...b, order: idx }));
    });
  }, []);

  const handleDragStart = useCallback((block: CustomFeedBlock, fromTimeline: boolean) => {
    setDraggedBlock(block);
    setDraggedFromTimeline(fromTimeline);
    setShowTrashZone(fromTimeline);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedBlock(null);
    setDraggedFromTimeline(false);
    setDragOverIndex(null);
    setShowTrashZone(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedBlock) return;

    if (draggedFromTimeline) {
      // Reordering within timeline
      setBlocks(prev => {
        const filtered = prev.filter(b => b.id !== draggedBlock.id);
        const newBlocks = [
          ...filtered.slice(0, targetIndex),
          draggedBlock,
          ...filtered.slice(targetIndex),
        ];
        return newBlocks.map((b, idx) => ({ ...b, order: idx }));
      });
    } else {
      // Adding from available blocks to timeline
      const newBlock = { ...draggedBlock, order: targetIndex };
      setBlocks(prev => {
        const newBlocks = [
          ...prev.slice(0, targetIndex),
          newBlock,
          ...prev.slice(targetIndex),
        ];
        return newBlocks.map((b, idx) => ({ ...b, order: idx }));
      });
    }

    setDragOverIndex(null);
  }, [draggedBlock, draggedFromTimeline]);

  const handleDropOnTimeline = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedBlock) return;

    if (!draggedFromTimeline) {
      // Adding to end of timeline
      const newBlock = { ...draggedBlock, order: blocks.length };
      setBlocks(prev => [...prev, newBlock]);
    }

    setDragOverIndex(null);
  }, [draggedBlock, draggedFromTimeline, blocks.length]);

  const handleDropOnTrash = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedBlock || !draggedFromTimeline) return;

    removeBlockFromTimeline(draggedBlock.id);
    setDraggedBlock(null);
    setDraggedFromTimeline(false);
    setShowTrashZone(false);
  }, [draggedBlock, draggedFromTimeline, removeBlockFromTimeline]);

  const handleSave = useCallback(() => {
    if (!feedName.trim()) {
      alert('Please enter a feed name');
      return;
    }

    if (blocks.length === 0) {
      alert('Please add at least one block to the timeline');
      return;
    }

    const feed: CustomFeed = {
      id: editingFeed?.id || `feed_${Date.now()}`,
      name: feedName.trim(),
      blocks: blocks.map((b, idx) => ({ ...b, order: idx })),
      loop,
      createdAt: editingFeed?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSave(feed);
    onClose();
  }, [feedName, blocks, loop, editingFeed, onSave, onClose]);

  const getTotalDuration = () => {
    return blocks.reduce((sum, block) => sum + block.durationSeconds, 0);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const remainingSeconds = seconds % 3600;
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    
    let result = `${hours}h`;
    if (mins > 0) result += ` ${mins}m`;
    if (secs > 0) result += ` ${secs}s`;
    return result;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">
              {editingFeed ? 'Edit Custom Feed' : 'Create Custom Feed'}
            </h2>
            <p className="text-sm text-white/60">
              Build a timeline of search blocks that play in sequence
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} className="text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Feed Settings */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Feed Name
              </label>
              <input
                type="text"
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                placeholder="My Custom Feed"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="loop-checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
                className="w-5 h-5 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              <label htmlFor="loop-checkbox" className="text-sm font-medium text-white/80 cursor-pointer">
                Loop forever (restart from beginning when finished)
              </label>
            </div>
          </div>

          {/* Create New Block */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Plus size={20} />
              Create Search Block
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newBlockSearch}
                onChange={(e) => setNewBlockSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createBlock()}
                placeholder="Enter search query..."
                className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
              />
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-white/60" />
                <input
                  type="number"
                  min={durationUnit === 'seconds' ? "15" : "1"}
                  max={durationUnit === 'seconds' ? "86400" : durationUnit === 'minutes' ? "1440" : "24"}
                  step={durationUnit === 'seconds' ? "15" : "1"}
                  value={newBlockDuration}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || (durationUnit === 'seconds' ? 15 : 1);
                    const min = durationUnit === 'seconds' ? 15 : 1;
                    setNewBlockDuration(Math.max(min, value));
                  }}
                  className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-center focus:outline-none focus:border-white/30 transition-colors"
                />
                <select
                  value={durationUnit}
                  onChange={(e) => {
                    const newUnit = e.target.value as 'seconds' | 'minutes' | 'hours';
                    setDurationUnit(newUnit);
                    // Convert current value to new unit
                    if (newUnit === 'minutes' && durationUnit === 'seconds') {
                      setNewBlockDuration(Math.max(1, Math.round(newBlockDuration / 60)));
                    } else if (newUnit === 'seconds' && durationUnit === 'minutes') {
                      setNewBlockDuration(Math.max(15, newBlockDuration * 60));
                    } else if (newUnit === 'hours' && durationUnit === 'seconds') {
                      setNewBlockDuration(Math.max(1, Math.round(newBlockDuration / 3600)));
                    } else if (newUnit === 'seconds' && durationUnit === 'hours') {
                      setNewBlockDuration(Math.max(15, newBlockDuration * 3600));
                    } else if (newUnit === 'hours' && durationUnit === 'minutes') {
                      setNewBlockDuration(Math.max(1, Math.round(newBlockDuration / 60)));
                    } else if (newUnit === 'minutes' && durationUnit === 'hours') {
                      setNewBlockDuration(Math.max(1, newBlockDuration * 60));
                    }
                  }}
                  className="px-2 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-white/30 transition-colors"
                  style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: 'white'
                  }}
                >
                  <option value="seconds" style={{ backgroundColor: '#1f2937', color: 'white' }}>sec</option>
                  <option value="minutes" style={{ backgroundColor: '#1f2937', color: 'white' }}>min</option>
                  <option value="hours" style={{ backgroundColor: '#1f2937', color: 'white' }}>hr</option>
                </select>
                <button
                  onClick={createBlock}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors whitespace-nowrap"
                >
                  Create
                </button>
              </div>
            </div>
          </div>

          {/* Available Blocks */}
          {availableBlocks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">
                Available Blocks (drag to timeline)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableBlocks.map((block, index) => (
                  <div
                    key={`available-${block.id}-${index}`}
                    draggable
                    onDragStart={() => handleDragStart(block, false)}
                    onDragEnd={handleDragEnd}
                    className="bg-white/5 border border-white/10 rounded-xl p-3 cursor-move hover:bg-white/10 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <GripVertical size={16} className="text-white/40 flex-shrink-0" />
                        <span className="text-white font-medium truncate">{block.searchQuery}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => duplicateBlock(block, false)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          title="Duplicate"
                        >
                          <Copy size={14} className="text-white/60" />
                        </button>
                        <button
                          onClick={() => removeBlockFromAvailable(block.id)}
                          className="p-1 hover:bg-red-500/20 rounded transition-colors"
                          title="Delete"
                        >
                          <X size={14} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-white/50">
                      <Clock size={12} />
                      {formatDuration(block.durationSeconds)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Timeline {blocks.length > 0 && `(${blocks.length} blocks)`}
              </h3>
              {blocks.length > 0 && (
                <div className="text-sm text-white/60">
                  Total: {formatDuration(getTotalDuration())}
                </div>
              )}
            </div>

            <div
              ref={timelineRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropOnTimeline}
              className={`min-h-[200px] bg-white/5 border-2 border-dashed rounded-2xl p-4 transition-all ${
                draggedBlock && !draggedFromTimeline
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-white/10'
              }`}
            >
              {blocks.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/40 text-center">
                  <div>
                    <p className="text-lg font-medium mb-1">No blocks in timeline</p>
                    <p className="text-sm">Create blocks above and drag them here</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block, index) => (
                    <div key={`${block.id}-${index}`}>
                      {/* Drop zone indicator */}
                      {dragOverIndex === index && draggedBlock && (
                        <div className="h-2 bg-blue-500 rounded-full mb-2 animate-pulse" />
                      )}

                      <div
                        draggable
                        onDragStart={() => handleDragStart(block, true)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-white/20 rounded-xl p-4 cursor-move hover:border-white/40 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 bg-white/10 rounded-lg text-white font-bold text-sm flex-shrink-0">
                            {index + 1}
                          </div>
                          <GripVertical size={20} className="text-white/40 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate mb-1">
                              {block.searchQuery}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-white/50">
                              <Clock size={12} />
                              {formatDuration(block.durationSeconds)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => duplicateBlock(block, true)}
                              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                              title="Duplicate"
                            >
                              <Copy size={16} className="text-white/60" />
                            </button>
                            <button
                              onClick={() => removeBlockFromTimeline(block.id)}
                              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                              title="Remove from timeline"
                            >
                              <X size={16} className="text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trash Zone */}
          {showTrashZone && (
            <div
              ref={trashZoneRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropOnTrash}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-red-500/20 border-2 border-red-500 rounded-2xl p-6 backdrop-blur-sm animate-slideUp"
            >
              <div className="flex items-center gap-3 text-red-400">
                <Trash2 size={24} />
                <span className="font-medium">Drop here to remove from timeline</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-white/10 bg-black/50">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg"
          >
            <Save size={18} />
            {editingFeed ? 'Save Changes' : 'Create Feed'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

