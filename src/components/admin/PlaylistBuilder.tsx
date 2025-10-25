'use client';

import { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, GripVertical, Search, Eye } from 'lucide-react';
import { BlockDefinition } from '@/types/timeline';
import { SoraFeedItem } from '@/types/sora';

interface PlaylistBuilderProps {
  onSave: (name: string, blocks: BlockDefinition[]) => void;
  onCancel: () => void;
  initialName?: string;
  initialBlocks?: BlockDefinition[];
}

interface BlockWithId extends BlockDefinition {
  id: string;
}

interface PreviewData {
  searchTerm: string;
  videos: SoraFeedItem[];
  loading: boolean;
}

function SortableBlock({ block, onUpdate, onDelete, onPreview }: {
  block: BlockWithId;
  onUpdate: (id: string, updates: Partial<BlockDefinition>) => void;
  onDelete: (id: string) => void;
  onPreview: (searchTerm: string, format: 'mixed' | 'wide' | 'tall') => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Search term input */}
        <div className="flex-1">
            <input
              type="text"
              placeholder="Search term (e.g., cats, dogs, nature)"
              value={block.searchTerm}
              onChange={(e) => onUpdate(block.id, { searchTerm: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
        </div>

        {/* Video count */}
        <div className="w-20">
          <input
            type="number"
            min="1"
            max="50"
            placeholder="Count"
            value={block.videoCount}
            onChange={(e) => onUpdate(block.id, { videoCount: parseInt(e.target.value) || 1 })}
            className="w-full px-2 py-2 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
        </div>

        {/* Fetch mode */}
        <select
          value={block.fetchMode}
          onChange={(e) => onUpdate(block.id, { fetchMode: e.target.value as 'newest' | 'random' })}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
        >
          <option value="newest">Newest</option>
          <option value="random">Random</option>
        </select>

        {/* Format selector */}
        <select
          value={block.format}
          onChange={(e) => onUpdate(block.id, { format: e.target.value as 'mixed' | 'wide' | 'tall' })}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
        >
          <option value="mixed">Mixed</option>
          <option value="wide">Wide</option>
          <option value="tall">Tall</option>
        </select>

        {/* Preview button */}
        <button
          onClick={() => onPreview(block.searchTerm, block.format)}
          disabled={!block.searchTerm.trim()}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:text-gray-400 disabled:cursor-not-allowed"
          title="Preview videos"
        >
          <Eye className="w-5 h-5" />
        </button>

        {/* Delete button */}
        <button
          onClick={() => onDelete(block.id)}
          className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default function PlaylistBuilder({ onSave, onCancel, initialName = '', initialBlocks = [] }: PlaylistBuilderProps) {
  const [name, setName] = useState(initialName);
  const [blocks, setBlocks] = useState<BlockWithId[]>(() => 
    initialBlocks.length > 0 
      ? initialBlocks.map((block, index) => ({ ...block, id: `block-${index}` }))
      : [{ id: 'block-0', searchTerm: '', videoCount: 5, fetchMode: 'random' as const, format: 'mixed' as const }]
  );
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addBlock = () => {
    const newBlock: BlockWithId = {
      id: `block-${Date.now()}`,
      searchTerm: '',
      videoCount: 5,
      fetchMode: 'random',
      format: 'mixed'
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id: string, updates: Partial<BlockDefinition>) => {
    setBlocks(blocks.map(block => 
      block.id === id ? { ...block, ...updates } : block
    ));
  };

  const deleteBlock = (id: string) => {
    if (blocks.length > 1) {
      setBlocks(blocks.filter(block => block.id !== id));
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const previewVideos = async (searchTerm: string, format: 'mixed' | 'wide' | 'tall' = 'mixed') => {
    if (!searchTerm.trim()) return;

    setPreviewData({ searchTerm, videos: [], loading: true });

    try {
      const response = await fetch(`/api/search/preview?term=${encodeURIComponent(searchTerm)}&count=5&mode=newest&format=${format}`);
      if (!response.ok) throw new Error('Failed to fetch preview');
      
      const data = await response.json();
      setPreviewData({ searchTerm, videos: data.videos, loading: false });
    } catch (error) {
      console.error('Preview error:', error);
      setPreviewData({ searchTerm, videos: [], loading: false });
    }
  };

  const handleSave = () => {
    const validBlocks = blocks.filter(block => 
      block.searchTerm.trim() && block.videoCount > 0
    );

    if (!name.trim()) {
      alert('Please enter a playlist name');
      return;
    }

    if (validBlocks.length === 0) {
      alert('Please add at least one valid block');
      return;
    }

    onSave(name.trim(), validBlocks.map(({ id, ...block }) => block));
  };

  const totalVideos = blocks.reduce((sum, block) => sum + (block.videoCount || 0), 0);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {initialName ? 'Edit Playlist' : 'Create New Playlist'}
          </h2>
          
          {/* Playlist name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Playlist Name
            </label>
            <input
              type="text"
              placeholder="Enter playlist name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <span>{blocks.length} blocks</span>
            <span>~{totalVideos} total videos</span>
          </div>
        </div>

        {/* Blocks */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Timeline Blocks</h3>
            <button
              onClick={addBlock}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Block
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {blocks.map((block) => (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    onUpdate={updateBlock}
                    onDelete={deleteBlock}
                    onPreview={previewVideos}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-4 text-sm text-gray-500">
            💡 Drag blocks to reorder them. The playlist will play blocks in order, then loop with different videos.
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {initialName ? 'Update Playlist' : 'Create Playlist'}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Preview: "{previewData.searchTerm}"
                </h3>
                <button
                  onClick={() => setPreviewData(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-96">
              {previewData.loading ? (
                <div className="text-center py-8">
                  <div className="text-gray-600">Loading preview...</div>
                </div>
              ) : previewData.videos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {previewData.videos.map((video) => (
                    <div key={video.post.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <img
                        src={video.post.attachments?.[0]?.encodings?.thumbnail?.path}
                        alt="Video thumbnail"
                        className="w-full h-32 object-cover"
                      />
                      <div className="p-3">
                        <div className="text-sm font-medium text-gray-900 mb-1">
                          @{video.profile.username}
                        </div>
                        <div className="text-xs text-gray-600 line-clamp-2">
                          {video.post.text || 'No description'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-600">No videos found for "{previewData.searchTerm}"</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
