import { NextRequest, NextResponse } from 'next/server';
import { DisplayManager } from '@/lib/display-manager';

// GET /api/displays - Get all displays
export async function GET() {
  try {
    const displays = DisplayManager.getAllDisplays();
    const stats = DisplayManager.getDisplayStats();
    
    return NextResponse.json({
      displays,
      stats
    });
  } catch (error) {
    console.error('Error fetching displays:', error);
    return NextResponse.json(
      { error: 'Failed to fetch displays' },
      { status: 500 }
    );
  }
}

// POST /api/displays - Create new display
export async function POST(request: NextRequest) {
  try {
    const { name, code } = await request.json();
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Display name is required' },
        { status: 400 }
      );
    }

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json(
        { error: 'Display code must be exactly 6 characters' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existingDisplay = DisplayManager.getDisplay(code.toUpperCase());
    if (existingDisplay) {
      return NextResponse.json(
        { error: 'Display code already exists' },
        { status: 409 }
      );
    }

    const display = DisplayManager.createDisplayWithCode(name, code.toUpperCase());
    
    return NextResponse.json(display, { status: 201 });
  } catch (error) {
    console.error('Error creating display:', error);
    return NextResponse.json(
      { error: 'Failed to create display' },
      { status: 500 }
    );
  }
}
