'use client';

import { TimelineProgress } from '@/types/timeline';

interface TimelineProgressProps {
  progress: TimelineProgress | null;
  className?: string;
}

export default function TimelineProgressComponent({ progress, className = '' }: TimelineProgressProps) {
  if (!progress) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
        <div className="text-sm text-gray-500">No active playlist</div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white rounded-lg border ${className}`}>
      {/* Current block info */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-gray-700">
            Currently Playing: {progress.currentBlock.name}
          </div>
          <div className="text-xs text-gray-500">
            Loop #{progress.overallProgress.loopCount + 1}
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-300 flex items-center justify-end pr-1"
            style={{ width: `${Math.max(progress.currentBlock.progress, 5)}%` }}
          >
            {progress.currentBlock.progress > 15 && (
              <div className="text-xs text-white font-medium">
                {Math.round(progress.currentBlock.progress)}%
              </div>
            )}
          </div>
        </div>
        
        <div className="text-xs text-gray-500">
          Video {progress.currentBlock.currentVideo} of {progress.currentBlock.totalVideos}
        </div>
      </div>

      {/* Blocks timeline */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-gray-600 mb-3">Timeline Blocks</div>
        {progress.blocks.map((block, index) => (
          <div key={index} className={`p-3 rounded-lg border-l-4 transition-all duration-200 ${
            block.isActive ? 'bg-blue-50 border-l-blue-500 shadow-sm' : 
            block.isCompleted ? 'bg-green-50 border-l-green-500' : 
            'bg-gray-50 border-l-gray-300'
          }`}>
            <div className="flex items-center gap-3">
              {/* Block status indicator */}
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                block.isActive ? 'bg-blue-500' : 
                block.isCompleted ? 'bg-green-500' : 
                'bg-gray-300'
              }`}></div>
              
              {/* Block info */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${
                  block.isActive ? 'font-semibold text-blue-800' : 
                  block.isCompleted ? 'font-medium text-green-800' : 
                  'text-gray-700'
                }`}>
                  {block.name}
                </div>
                <div className={`text-xs mt-1 ${
                  block.isActive ? 'text-blue-600' : 
                  block.isCompleted ? 'text-green-600' : 
                  'text-gray-500'
                }`}>
                  {block.videoCount} videos
                  {block.timesPlayed > 0 && ` • Played ${block.timesPlayed} times`}
                </div>
              </div>

              {/* Block progress indicator */}
              {block.isActive && (
                <div className="text-xs text-blue-700 font-semibold bg-blue-100 px-2 py-1 rounded-full">
                  Playing
                </div>
              )}
              {block.isCompleted && (
                <div className="text-xs text-green-700 font-medium bg-green-100 px-2 py-1 rounded-full">
                  ✓ Done
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Overall progress */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Position: {progress.overallProgress.currentPosition} / {progress.overallProgress.totalInCurrentLoop}
          </span>
          <span>
            {Math.round((progress.overallProgress.currentPosition / progress.overallProgress.totalInCurrentLoop) * 100)}% complete
          </span>
        </div>
      </div>
    </div>
  );
}
