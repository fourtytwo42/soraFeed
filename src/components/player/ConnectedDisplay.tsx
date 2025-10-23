'use client';

import { CheckCircle, Monitor } from 'lucide-react';

interface ConnectedDisplayProps {
  code: string;
  displayName?: string;
}

export default function ConnectedDisplay({ code, displayName }: ConnectedDisplayProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:50px_50px]"></div>
      </div>

      <div className="relative z-10 text-center">
        {/* Success Icon */}
        <div className="mb-8">
          <div className="relative">
            <Monitor className="w-24 h-24 text-white mx-auto mb-4" />
            <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="mb-8">
          <div className="text-4xl font-bold text-white mb-2">Connected!</div>
          <div className="text-green-200 text-xl">Display is now online</div>
        </div>

        {/* Display Info */}
        <div className="mb-8 space-y-2">
          {displayName && (
            <div className="text-white text-lg">
              <span className="text-green-200">Name:</span> {displayName}
            </div>
          )}
          <div className="text-white text-lg">
            <span className="text-green-200">Code:</span> <span className="font-mono">{code}</span>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-green-200 text-lg max-w-md">
          <p className="mb-4">This display is now connected to the admin system.</p>
          <div className="space-y-2 text-sm">
            <p>✅ Ready to receive playlists</p>
            <p>✅ Controllable from admin dashboard</p>
            <p>✅ Will start playing when playlist is assigned</p>
          </div>
        </div>

        {/* Waiting indicator */}
        <div className="mt-8">
          <div className="flex items-center justify-center gap-2 text-green-300">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm">Waiting for playlist assignment...</span>
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="absolute top-6 right-6">
        <div className="flex items-center gap-2 text-green-200">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium">Connected</span>
        </div>
      </div>

      {/* Code badge */}
      <div className="absolute top-6 left-6">
        <div className="bg-green-800/50 backdrop-blur-sm border border-green-600 rounded-lg px-3 py-2">
          <div className="text-green-200 text-xs">Display Code</div>
          <div className="text-white font-mono font-bold">{code}</div>
        </div>
      </div>
    </div>
  );
}
