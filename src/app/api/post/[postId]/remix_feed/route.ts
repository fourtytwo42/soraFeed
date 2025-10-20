import { NextRequest, NextResponse } from 'next/server';
import { SoraFeedResponse } from '@/types/sora';

const SORA_BASE_URL = 'https://sora.chatgpt.com/backend/project_y';

export async function GET(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = searchParams.get('limit') || '20';

    console.log('🔍 Fetching Sora remix feed for post:', postId, 'with params:', { limit, cursor: cursor ? 'present' : 'none' });

    const requiredEnvVars = [
      'AUTH_BEARER_TOKEN',
      'COOKIE_SESSION',
      'CF_CLEARANCE',
      'USER_AGENT',
      'CF_BM',
      'OAI_SC',
      'OAI_DID',
      'ACCEPT_LANGUAGE'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return NextResponse.json(
        { error: `Missing environment variables: ${missingVars.join(', ')}` },
        { status: 500 }
      );
    }

    const cookieHeader = [
      `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
      `cf_clearance=${process.env.CF_CLEARANCE}`,
      `__cf_bm=${process.env.CF_BM}`,
      `oai-sc=${process.env.OAI_SC}`,
      `oai-did=${process.env.OAI_DID}`,
    ].filter(Boolean).join('; ');

    // Build URL with optional cursor parameter
    const urlParams = new URLSearchParams({
      limit,
    });
    
    if (cursor) {
      urlParams.append('cursor', cursor);
    }

    const url = `${SORA_BASE_URL}/post/${postId}/remix_feed?${urlParams.toString()}`;

    console.log('📡 Making request to:', url);
    console.log('🍪 Cookie string length:', cookieHeader.length);
    console.log('🔑 Bearer token present:', !!process.env.AUTH_BEARER_TOKEN);

    const soraResponse = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'Accept': '*/*',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
        'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0',
        'Referer': `https://sora.chatgpt.com/p/${postId}`,
        'Cookie': cookieHeader,
      },
      cache: 'no-store',
    });

    console.log('📊 Response status:', soraResponse.status);
    console.log('📊 Response headers:', Object.fromEntries(soraResponse.headers.entries()));

    if (!soraResponse.ok) {
      const errorText = await soraResponse.text();
      console.error('❌ Sora API error:', soraResponse.status, soraResponse.statusText, errorText);
      return NextResponse.json(
        { error: `Failed to fetch remix feed from Sora API: ${soraResponse.statusText}`, details: errorText },
        { status: soraResponse.status }
      );
    }

    const data: SoraFeedResponse = await soraResponse.json();
    console.log('✅ Successfully fetched remix feed with', data.items?.length || 0, 'video remixes');

    return NextResponse.json(data);
  } catch (error) {
    console.error('🚨 Server error fetching remix feed:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching remix feed' },
      { status: 500 }
    );
  }
}
