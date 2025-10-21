import FeedLoader from '@/components/FeedLoader';
import { GestureProvider } from '@/contexts/GestureContext';

export default function Home() {
  return (
    <GestureProvider>
      <main className="w-full h-dvh overflow-hidden">
        <FeedLoader />
      </main>
    </GestureProvider>
  );
}