'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeDisplayProps {
  code: string;
  displayName?: string;
}

export default function CodeDisplay({ code, displayName }: CodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:50px_50px]"></div>
      </div>

      <div className="relative z-10 text-center">
        {/* Display name */}
        {displayName && (
          <div className="text-white/70 text-2xl mb-8 font-light">
            {displayName}
          </div>
        )}

        {/* Main code display */}
        <div className="mb-8">
          <div className="text-white/50 text-lg mb-4">Display Code</div>
          <div 
            className="text-6xl md:text-8xl font-mono font-bold text-white tracking-wider cursor-pointer hover:text-blue-200 transition-colors duration-200"
            onClick={handleCopy}
            title="Click to copy"
          >
            {code}
          </div>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all duration-200 backdrop-blur-sm border border-white/20"
        >
          {copied ? (
            <>
              <Check className="w-5 h-5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              Copy Code
            </>
          )}
        </button>

        {/* Instructions */}
        <div className="mt-12 text-white/60 text-lg max-w-md">
          <p className="mb-4">Enter this code in the admin dashboard to control this display.</p>
          <p className="text-sm">Waiting for playlist assignment...</p>
        </div>
      </div>

      {/* Status indicator */}
      <div className="absolute top-6 right-6">
        <div className="flex items-center gap-2 text-white/60">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-sm">Online</span>
        </div>
      </div>
    </div>
  );
}
