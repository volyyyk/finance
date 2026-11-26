// Cloudflare Worker: a narrow CORS bridge for public MOEX ISS GET requests.
// Deploy as a Worker and save its workers.dev URL in FinApp settings.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (incoming.pathname !== '/iss' && !incoming.pathname.startsWith('/iss/')) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // Host is fixed: this endpoint cannot be used as an arbitrary open proxy.
    const upstreamUrl = new URL(incoming.pathname + incoming.search, 'https://iss.moex.com');
    let upstream;
    try {
      upstream = await fetch(upstreamUrl.toString(), {
        headers: { 'Accept': 'application/json' },
        cf: { cacheEverything: true, cacheTtl: 60 }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'MOEX ISS is unreachable',
        detail: String(error?.message || error).slice(0, 160)
      }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    const headers = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', upstream.ok ? 'public, max-age=30, s-maxage=60' : 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
