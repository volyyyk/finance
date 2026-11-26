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
    if (incoming.pathname.startsWith('/vim/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
      const fundId = incoming.pathname.split('/')[2];
      const pages = {
        '8000': 'https://www.wealthim.ru/products/pif/opif/wimyao/',
        '8002': 'https://www.wealthim.ru/products/pif/opif/wimyo/'
      };
      const sourceUrl = pages[fundId];
      if (!sourceUrl) return jsonResponse({ error: 'Unknown VIM fund' }, 404);
      try {
        const upstream = await fetch(sourceUrl, {
          headers: { 'Accept': 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 FinApp/1.0' },
          cf: { cacheEverything: true, cacheTtl: 21600 }
        });
        if (!upstream.ok) return jsonResponse({
          error: 'VIM source returned HTTP ' + upstream.status, upstreamStatus: upstream.status
        }, upstream.status);
        const html = await upstream.text();
        const strip = value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
          .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
          .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
        const number = value => {
          const parsed = Number(String(value).replace(/[\s\u00a0]/g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
          return Number.isFinite(parsed) ? parsed : null;
        };
        const history = [];
        for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
          const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => strip(cell[1]));
          const dateIndex = cells.findIndex(cell => /^\d{2}\.\d{2}\.\d{4}$/.test(cell));
          if (dateIndex < 0) continue;
          const nums = cells.slice(dateIndex + 1).map(number);
          if (nums.length < 3 || !(nums[0] > 0) || !(nums[2] >= 0)) continue;
          const [day, month, year] = cells[dateIndex].split('.');
          history.push({
            date: year + '-' + month + '-' + day,
            price: nums[0],
            nav: nums[2]
          });
        }
        const unique = [...new Map(history.map(point => [point.date, point])).values()]
          .sort((a, b) => a.date.localeCompare(b.date));
        if (!unique.length) return jsonResponse({
          error: 'VIM page loaded, but its historical table format was not recognized',
          sourceUrl, htmlLength: html.length
        }, 502);
        const latest = unique[unique.length - 1];
        return jsonResponse({
          fundId, source: sourceUrl, fetchedAt: new Date().toISOString(),
          date: latest.date, price: latest.price, nav: latest.nav, history: unique
        }, 200, { 'Cache-Control': 'public, max-age=300, s-maxage=1800' });
      } catch (error) {
        return jsonResponse({ error: 'VIM source request failed', detail: String(error?.message || error).slice(0, 240) }, 502);
      }
    }
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

        const detail = (await upstream.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 900);
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