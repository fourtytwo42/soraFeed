import { Monitor, Loader2 } from 'lucide-react';

interface LoadingDisplayProps {
  code: string;
  displayName: string;
}

export default function LoadingDisplay({ code, displayName }: LoadingDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 text-white p-8 relative">
      <div className="text-center">
        <Loader2 className="w-16 h-16 text-white mb-8 animate-spin" />
        <h1 className="text-3xl font-bold mb-4">Loading Next Video...</h1>
        <p className="text-lg text-white/60">Preparing your content</p>
      </div>

      {/* Status indicator */}
      <div className="absolute top-6 right-6">
        <div className="flex items-center gap-2 text-white/60">
          <Monitor className="w-5 h-5" />
          <span>VM Client</span>
        </div>
      </div>

      {/* Display info in bottom corner */}
      <div className="absolute bottom-6 left-6">
        <div className="text-white/40 text-sm">
          <div>{displayName}</div>
          <div className="font-mono">{code}</div>
        </div>
      </div>
    </div>
  );
}
