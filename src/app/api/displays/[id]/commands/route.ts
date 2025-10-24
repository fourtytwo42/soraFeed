import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';
import { DisplayCommand } from '@/types/timeline';

// POST /api/displays/[id]/commands - Send command to display
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    
    // Handle commands - write directly to database for playback state
    switch (type) {
      case 'play':
        DisplayManager.playDisplay(id);
        break;
      case 'pause':
        DisplayManager.pauseDisplay(id);
        break;
      case 'mute':
        DisplayManager.muteDisplay(id);
        break;
      case 'unmute':
        DisplayManager.unmuteDisplay(id);
        break;
      case 'seek':
        if (payload?.position !== undefined) {
          DisplayManager.seekDisplay(id, payload.position);
        } else {
          return NextResponse.json(
            { error: 'Seek command requires position payload' },
            { status: 400 }
          );
        }
        break;
      case 'next':
      case 'previous':
      case 'playVideo':
        // These commands still use the old command queue system
        const validCommands = ['next', 'previous', 'playVideo'];
        if (!validCommands.includes(type)) {
          return NextResponse.json(
            { error: 'Invalid command type' },
            { status: 400 }
          );
        }
        const command: DisplayCommand = { type, payload };
        DisplayManager.addCommand(id, command);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid command type' },
          { status: 400 }
        );
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Command ${type} sent to display ${id}` 
    });
  } catch (error) {
    console.error('Error sending command:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to send command: ${errorMessage}` },
      { status: 500 }
    );
  }
}