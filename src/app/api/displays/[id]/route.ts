import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';

// GET /api/displays/[id] - Get specific display
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const display = DisplayManager.getDisplay(id);
    
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(display);
  } catch (error) {
    console.error('Error fetching display:', error);
    return NextResponse.json(
      { error: 'Failed to fetch display' },
      { status: 500 }
    );
  }
}

// PUT /api/displays/[id] - Update display
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name } = await request.json();
    
    const display = DisplayManager.getDisplay(id);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }

    if (name && typeof name === 'string') {
      DisplayManager.updateDisplayName(id, name);
    }
    
    const updatedDisplay = DisplayManager.getDisplay(id);
    return NextResponse.json(updatedDisplay);
  } catch (error) {
    console.error('Error updating display:', error);
    return NextResponse.json(
      { error: 'Failed to update display' },
      { status: 500 }
    );
  }
}

// DELETE /api/displays/[id] - Delete display
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const display = DisplayManager.getDisplay(id);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }

    DisplayManager.deleteDisplay(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting display:', error);
    return NextResponse.json(
      { error: 'Failed to delete display' },
      { status: 500 }
    );
  }
}
