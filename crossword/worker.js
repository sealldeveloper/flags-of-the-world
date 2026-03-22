const UPSTREAM = 'https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    const get  = url.searchParams.get('get');

    // Only allow the two specific endpoints
    const isPuzzleList = date === 'list' && get === 'archivecurrent';
    const isPuzzle     = date && /^\d{6}$/.test(date) && !get;

    if (!isPuzzleList && !isPuzzle) {
      return new Response('Not allowed', { status: 403, headers: CORS_HEADERS });
    }

    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set('date', date);
    if (get) upstream.searchParams.set('get', get);

    const res = await fetch(upstream.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, {
        status: res.status,
        headers: CORS_HEADERS,
      });
    }

    const body = await res.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/plain; charset=iso-8859-1',
        // Puzzle list changes daily, individual puzzles never change
        'Cache-Control': isPuzzleList ? 'public, max-age=3600' : 'public, max-age=86400',
      },
    });
  },
};
