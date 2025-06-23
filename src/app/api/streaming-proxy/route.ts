import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const streamUrl = searchParams.get('url');
  const range = request.headers.get('range');

  if (!streamUrl) {
    return NextResponse.json({ error: 'Stream URL is required' }, { status: 400 });
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      'Origin': 'https://moviebox.ng',
      'Referer': 'https://moviebox.ng',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };
    if (range) {
      upstreamHeaders['Range'] = range;
    }

    const response = await fetch(streamUrl, {
      headers: upstreamHeaders,
    });

    // Pass through all relevant headers
    const headers = new Headers();
    for (const [key, value] of response.headers.entries()) {
      if ([
        'content-type',
        'content-length',
        'accept-ranges',
        'content-range',
        'cache-control',
        'expires',
        'last-modified',
        'pragma',
        'date',
        'etag',
      ].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    // Remove Content-Disposition if present
    headers.delete('content-disposition');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

    // Use the same status as the upstream (200 or 206 for partial content)
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('Streaming proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stream' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
    },
  });
} 