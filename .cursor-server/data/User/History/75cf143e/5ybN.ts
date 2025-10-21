import { NextRequest, NextResponse } from 'next/server';

const SORA_BASE_URL = 'https://sora.chatgpt.com/backend/project_y';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '20';
    const maxDepth = searchParams.get('max_depth') || '1';
    const { postId } = await params;

    console.log('🌳 Fetching remix tree for post:', postId);

    // Check for minimal required environment variables
    const requiredEnvVars = [
      'AUTH_BEARER_TOKEN'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return NextResponse.json(
        { error: 'Missing required environment variables', missing: missingVars },
        { status: 500 }
      );
    }

    console.log('🔑 Bearer token present:', !!process.env.AUTH_BEARER_TOKEN);

    const url = `${SORA_BASE_URL}/post/${postId}/tree?limit=${limit}&max_depth=${maxDepth}`;
    console.log('📡 Making request to:', url);

    // Minimal headers - only Bearer token required for public remix trees
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'Accept': '*/*',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
        'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Referer': `https://sora.chatgpt.com/p/${postId}`,
      },
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, errorText.slice(0, 500));
      return NextResponse.json(
        { error: `API request failed: ${response.status}`, details: errorText.slice(0, 200) },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('✅ Successfully fetched remix tree with', data.children?.items?.length || 0, 'remixes');

    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
