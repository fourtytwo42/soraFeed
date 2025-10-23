import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';

// GET /api/displays/[id] - Get specific display
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

// DELETE /api/displays/[id] - Delete display and all associated data
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = DisplayManager.deleteDisplay(id);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Display ${id} and all associated data deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting display:', error);
    return NextResponse.json(
      { error: 'Failed to delete display' },
      { status: 500 }
    );
  }
}

// PATCH /api/displays/[id] - Update display name
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name } = await request.json();
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Display name is required' },
        { status: 400 }
      );
    }
    
    const display = DisplayManager.getDisplay(id);
    if (!display) {
      return NextResponse.json(
        { error: 'Display not found' },
        { status: 404 }
      );
    }
    
    DisplayManager.updateDisplayName(id, name);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Display name updated successfully' 
    });
  } catch (error) {
    console.error('Error updating display:', error);
    return NextResponse.json(
      { error: 'Failed to update display' },
      { status: 500 }
    );
  }
}