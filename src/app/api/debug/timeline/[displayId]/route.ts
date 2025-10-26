import { NextRequest, NextResponse } from 'next/server';
import { queueDb } from '@/lib/sqlite';

// GET /api/debug/timeline/[displayId] - Debug timeline videos for a display
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ displayId: string }> }
) {
  try {
    const { displayId } = await params;
    
    // Get all timeline videos for this display
    const stmt = queueDb.prepare(`
      SELECT 
        id,
        video_id,
        block_id,
        timeline_position,
        block_position,
        status,
        created_at
      FROM timeline_videos 
      WHERE display_id = ?
      ORDER BY timeline_position ASC
    `);
    
    const videos = stmt.all(displayId);
    
    // Group by block_id
    const blockGroups = videos.reduce((acc: any, video: any) => {
      const blockId = video.block_id;
      if (!acc[blockId]) {
        acc[blockId] = [];
      }
      acc[blockId].push(video);
      return acc;
    }, {});
    
    return NextResponse.json({
      displayId,
      totalVideos: videos.length,
      blockGroups,
      videos: videos.slice(0, 20) // First 20 videos for debugging
    });
    
  } catch (error) {
    console.error('Error getting timeline debug info:', error);
    return NextResponse.json(
      { error: 'Failed to get timeline debug info' },
      { status: 500 }
    );
  }
}
