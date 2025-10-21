import { NextRequest, NextResponse } from 'next/server';

const SORA_API_BASE = 'https://api.openai.com/v1/videos';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    
    // Check for API key
    if (!process.env.SORA_API_KEY) {
      return NextResponse.json(
        { error: 'Sora API key not configured' },
        { status: 500 }
      );
    }

    console.log('📥 Downloading video from Sora API:', videoId);

    // Fetch video from Sora API
    const response = await fetch(`${SORA_API_BASE}/${videoId}/content`, {
      headers: {
        'Authorization': `Bearer ${process.env.SORA_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Sora API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Failed to download video: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the video content
    const videoBuffer = await response.arrayBuffer();
    
    console.log('✅ Successfully downloaded video from Sora API');

    // Return the video with appropriate headers
    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${videoId}.mp4"`,
        'Content-Length': videoBuffer.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error('💥 Server error downloading video:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

