'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Generate a random 6-digit alphanumeric code
function generateDisplayCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function PlayerRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Check if we have a stored code in localStorage
    const storedCode = localStorage.getItem('sorafeed-display-code');
    
    if (storedCode) {
      // Use existing code
      console.log('🔑 Redirecting to stored display code:', storedCode);
      router.replace(`/player/${storedCode}`);
    } else {
      // Generate new code and store it
      const newCode = generateDisplayCode();
      console.log('🆕 Generated new display code:', newCode);
      localStorage.setItem('sorafeed-display-code', newCode);
      router.replace(`/player/${newCode}`);
    }
  }, [router]);

  return (
    <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <div className="text-white text-xl">Initializing display...</div>
      </div>
    </div>
  );
}
