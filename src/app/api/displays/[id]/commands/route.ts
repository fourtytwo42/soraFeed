import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';
import { DisplayCommand } from '@/types/timeline';

// POST /api/displays/[id]/commands - Send command to display
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { type, payload } = await request.json();
    
    if (!type || typeof type !== 'string') {
      return NextResponse.json(
        { error: 'Command type is required' },
        { status: 400 }
      );
    }
    
    // Check if display exists
    const display = DisplayManager.getDisplay(id);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }
    
    // Valid command types
    const validCommands = ['play', 'pause', 'next', 'previous', 'seek', 'playVideo', 'mute', 'unmute'];
    if (!validCommands.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid command type' },
        { status: 400 }
      );
    }
    
    const command: DisplayCommand = { type, payload };
    DisplayManager.addCommand(id, command);
    
    return NextResponse.json({ 
      success: true, 
      message: `Command ${type} sent to display ${id}` 
    });
  } catch (error) {
    console.error('Error sending command:', error);
    return NextResponse.json(
      { error: 'Failed to send command' },
      { status: 500 }
    );
  }
}