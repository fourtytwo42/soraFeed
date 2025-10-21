import VideoFeed from '@/components/VideoFeed';
import { mockFeedData } from '@/lib/mockData';

export default function Home() {
  return (
    <main className="w-full h-screen overflow-hidden">
      <VideoFeed items={mockFeedData.items} />
    </main>
  );
}