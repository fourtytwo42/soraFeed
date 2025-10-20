import { NextRequest, NextResponse } from 'next/server';
import { SoraFeedResponse } from '@/types/sora';

const SORA_BASE_URL = 'https://sora.chatgpt.com/backend/project_y';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '16';
    const cut = searchParams.get('cut') || 'nf2_latest';
    const cursor = searchParams.get('cursor');

    console.log('🔍 Fetching Sora feed with params:', { limit, cut, cursor: cursor ? 'present' : 'none' });

    // Check if we have required environment variables
    const requiredEnvVars = [
      'AUTH_BEARER_TOKEN',
      'COOKIE_SESSION', 
      'CF_CLEARANCE',
      'USER_AGENT'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return NextResponse.json(
        { error: 'Missing required environment variables', missing: missingVars },
        { status: 500 }
      );
    }

    // Build cookie string
    const cookies = [
      `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
      process.env.CF_CLEARANCE ? `cf_clearance=${process.env.CF_CLEARANCE}` : null,
      process.env.CF_BM ? `__cf_bm=${process.env.CF_BM}` : null,
      process.env.OAI_SC ? `oai-sc=${process.env.OAI_SC}` : null,
      process.env.OAI_DID ? `oai-did=${process.env.OAI_DID}` : null,
    ].filter(Boolean).join('; ');

    console.log('🍪 Cookie string length:', cookies.length);
    console.log('🔑 Bearer token present:', !!process.env.AUTH_BEARER_TOKEN);

    const headers = {
      'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
      'Accept': '*/*',
      'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
      'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://sora.chatgpt.com/explore',
      'Cookie': cookies,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    // Build URL with optional cursor parameter
    const urlParams = new URLSearchParams({
      limit,
      cut,
    });
    
    if (cursor) {
      urlParams.append('cursor', cursor);
    }
    
    const url = `${SORA_BASE_URL}/feed?${urlParams.toString()}`;
    console.log('📡 Making request to:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500) + (errorText.length > 500 ? '...' : '')
      });

      // Check if it's a Cloudflare challenge
      if (response.status === 403 && errorText.includes('challenge')) {
        return NextResponse.json(
          { 
            error: 'Cloudflare challenge detected',
            status: response.status,
            message: 'The API is protected by Cloudflare. Credentials may be expired or invalid.',
            suggestion: 'Try refreshing your browser session and extracting new credentials.'
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { 
          error: 'Failed to fetch feed',
          status: response.status,
          statusText: response.statusText,
          body: errorText.substring(0, 200)
        },
        { status: response.status }
      );
    }

    const data: SoraFeedResponse = await response.json();
    console.log('✅ Successfully fetched feed with', data.items?.length || 0, 'items');

    return NextResponse.json(data);

  } catch (error) {
    console.error('💥 Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
