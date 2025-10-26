import { NextRequest, NextResponse } from 'next/server';
import { queueDb } from '@/lib/sqlite';

// POST /api/admin/reset-position/[displayId] - Reset timeline position to 0
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ displayId: string }> }
) {
  try {
    const { displayId } = await params;
    
    console.log(`🔄 Resetting timeline position for display ${displayId}`);
    
    // Reset timeline position to 0
    const stmt = queueDb.prepare('UPDATE displays SET timeline_position = 0 WHERE id = ?');
    stmt.run(displayId);
    
    return NextResponse.json({
      success: true,
      message: `Reset timeline position for display ${displayId}`
    });
    
  } catch (error) {
    console.error('Error resetting timeline position:', error);
    return NextResponse.json(
      { error: 'Failed to reset timeline position' },
      { status: 500 }
    );
  }
}
