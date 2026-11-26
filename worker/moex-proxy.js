// Cloudflare Worker: narrow CORS bridge for public MOEX ISS GET requests.
// Upstream errors are returned with their real status and a bounded diagnostic body.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept',
  'Access-Control-Expose-Headers': 'X-MOEX-Upstream-Status',
  'Access-Control-Max-Age': '86400'
};

const jsonResponse = (payload, status, extra = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  }
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (incoming.pathname !== '/iss' && !incoming.pathname.startsWith('/iss/')) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

    // Fixed upstream host: this Worker is not an arbitrary open proxy.
    // MOEX ISS data is public; HTTP is used here because MOEX TLS validation
    // currently fails in the Cloudflare Worker runtime (HTTP 526).
    // Do not send credentials, tokens, or private data through this upstream.
    const upstreamUrl = new URL(incoming.pathname + incoming.search, 'http://iss.moex.com');
    let lastFailure = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const upstream = await fetch(upstreamUrl.toString(), {
          headers: { 'Accept': 'application/json' },
          cf: { cacheEverything: true, cacheTtl: 60 }
        });

        if (upstream.ok) {
          const headers = new Headers(upstream.headers);
          for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
          headers.set('Cache-Control', 'public, max-age=30, s-maxage=60');
          headers.set('X-MOEX-Upstream-Status', String(upstream.status));
          return new Response(upstream.body, { status: upstream.status, headers });
        }

        const detail = (await upstream.text().catch(() => '')).replace(/\\s+/g, ' ').slice(0, 900);
        lastFailure = {
          error: 'MOEX ISS returned HTTP ' + upstream.status,
          upstreamStatus: upstream.status,
          detail: detail || null,
          attempt
        };

        if (attempt < 2 && (upstream.status === 429 || upstream.status >= 500)) {
          await wait(250);
          continue;
        }

        return jsonResponse(lastFailure, upstream.status, {
          'X-MOEX-Upstream-Status': String(upstream.status)
        });
      } catch (error) {
        lastFailure = {
          error: 'MOEX ISS network request failed',
          detail: String(error?.message || error).slice(0, 240),
          attempt
        };
        if (attempt < 2) {
          await wait(250);
          continue;
        }
      }
    }

    return jsonResponse(lastFailure || { error: 'MOEX ISS unavailable' }, 502);
  }
};