import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';
import { DisplayCommand } from '@/types/timeline';

// POST /api/displays/[id]/commands - Send command to display
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { type, payload } = await request.json();
    
    const display = DisplayManager.getDisplay(id);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }

    const validCommands = ['play', 'pause', 'next', 'previous', 'seek', 'playVideo', 'mute', 'unmute'];
    if (!validCommands.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid command type' },
        { status: 400 }
      );
    }

    const command: DisplayCommand = {
      type,
      payload,
      timestamp: Date.now()
    };

    DisplayManager.addCommand(id, command);
    
    return NextResponse.json({ success: true, command });
  } catch (error) {
    console.error('Error sending command:', error);
    return NextResponse.json(
      { error: 'Failed to send command' },
      { status: 500 }
    );
  }
}
