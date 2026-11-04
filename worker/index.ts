// Cloudflare Worker: private API routes in front of the static app (brief §8).
// Only /api/* reaches this code (see run_worker_first in wrangler.jsonc); everything else is static assets.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  OWNER_EMAIL: string;
  TWELVE_DATA_API_KEY?: string; // Worker secret, never shipped to the browser
  TWELVE_DATA_BASE?: string; // override for tests
}

export interface ListingCandidate {
  provider: 'twelvedata';
  symbol: string;
  name: string;
  exchange: string;
  micCode: string;
  country: string | null; // ISO 3166-1 alpha-2 when it can be resolved
  countryName: string;
  currency: string;
  timezone: string;
  type: string;
  priceAccess: string | null; // provider plan needed for this listing's data, if reported
}

const EQUITY_TYPES = new Set([
  'Common Stock', 'Preferred Stock', 'Depositary Receipt', 'REIT', 'ETF', 'Unit', 'Limited Partnership',
  'Trust', 'Closed-end Fund', 'Right', 'Warrant',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Owner check: the browser sends its Supabase access token; we ask Supabase who it belongs to.
async function requireOwner(req: Request, env: Env): Promise<Response | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'Sign in required' }, 401);
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth },
  });
  if (!r.ok) return json({ error: 'Session expired. Sign in again.' }, 401);
  const user = (await r.json()) as { email?: string };
  if ((user.email ?? '').toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return json({ error: 'Not allowed' }, 403);
  return null;
}

// "United States" → "US", using the runtime's own region names.
let countryIndex: Map<string, string> | null = null;
function countryCode(name: string): string | null {
  if (!countryIndex) {
    countryIndex = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        try {
          const n = names.of(code);
          if (n && n !== code) countryIndex.set(n.toLowerCase(), code);
        } catch {
          /* not a region */
        }
      }
    }
    // Common provider spellings that differ from CLDR names.
    for (const [n, c] of [['korea', 'KR'], ['south korea', 'KR'], ['republic of korea', 'KR'], ['hong kong', 'HK'],
      ['taiwan', 'TW'], ['united states of america', 'US'], ['usa', 'US'], ['uk', 'GB'], ['russia', 'RU'],
      ['vietnam', 'VN'], ['czech republic', 'CZ'], ['turkey', 'TR']] as const) {
      countryIndex.set(n, c);
    }
  }
  return countryIndex.get(name.trim().toLowerCase()) ?? null;
}

async function symbolSearch(req: Request, env: Env): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 60) return json({ error: 'Enter 2–60 characters.' }, 400);
  if (!env.TWELVE_DATA_API_KEY) {
    return json({ error: 'Symbol search is not configured. Add the TWELVE_DATA_API_KEY secret to the Worker.' }, 503);
  }
  const base = env.TWELVE_DATA_BASE ?? 'https://api.twelvedata.com';
  const url = `${base}/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=40&show_plan=true&apikey=${encodeURIComponent(env.TWELVE_DATA_API_KEY)}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { accept: 'application/json' } });
  } catch {
    return json({ error: 'Symbol provider unreachable. Try again shortly.' }, 502);
  }
  const body = (await upstream.json().catch(() => null)) as
    | { status?: string; message?: string; code?: number; data?: Record<string, unknown>[] }
    | null;
  if (!upstream.ok || !body || body.status === 'error') {
    const limited = upstream.status === 429 || body?.code === 429;
    return json({ error: limited ? 'Search limit reached. Wait a minute and retry.' : 'Symbol provider returned an error.' },
      limited ? 429 : 502);
  }
  const seen = new Set<string>();
  const results: ListingCandidate[] = [];
  for (const d of body.data ?? []) {
    const type = String(d.instrument_type ?? '');
    const mic = String(d.mic_code ?? '').toUpperCase();
    const symbol = String(d.symbol ?? '');
    if (!symbol || !/^[A-Z0-9]{4}$/.test(mic) || (type && !EQUITY_TYPES.has(type))) continue;
    const key = `${symbol}|${mic}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const access = d.access as { plan?: string } | undefined;
    results.push({
      provider: 'twelvedata',
      symbol,
      name: String(d.instrument_name ?? symbol),
      exchange: String(d.exchange ?? mic),
      micCode: mic,
      country: countryCode(String(d.country ?? '')),
      countryName: String(d.country ?? ''),
      currency: String(d.currency ?? '').toUpperCase(),
      timezone: String(d.exchange_timezone ?? ''),
      type,
      priceAccess: access?.plan ?? null,
    });
  }
  return json({ results });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const denied = await requireOwner(req, env);
      if (denied) return denied;
      if (pathname === '/api/symbol-search') return symbolSearch(req, env);
      return json({ error: 'Not found' }, 404);
    }
    return env.ASSETS.fetch(req);
  },
};
