# Stock Intelligence Dashboard (MVP front end)

Front end for the Stock Intelligence brief (v1.0). It implements the five MVP screens against
sample data, so the UI can be used and reviewed before the collectors and Worker API exist.

## Run

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # type-check + production build to dist/
    npm run preview

## Status

| Area | Status |
|---|---|
| Owner sign-in (Supabase Auth, email + password) | Live |
| Overview, Search, Favourites, Stock detail, Settings | Live, reading Supabase |
| Watchlist | Stored in Supabase (`watchlist`) |
| Listing registry | Manual entry on Search until a symbol-search provider is chosen |
| Times: stored UTC, shown MYT; schedule 48 + 32 = 80 runs/day | Live |
| News collector: Google News RSS via Scrapling, dedup L1/L2, event clustering, direct links | Live (GitHub Actions) |
| Indirect links (relationships), GDELT, publisher RSS | Next |
| Delayed price adapter | Not started |

## Structure

    src/
      lib/types.ts        data model (brief §5)
      lib/time.ts         MYT formatting, freshness, collection schedule
      lib/supabase.ts     Supabase client (public URL + publishable key)
      lib/auth.tsx        owner session
      lib/store.tsx       loads tables after sign-in; watchlist and listing writes
      lib/data.ts         price formatting helpers
      components/         badges, layout, event card
      pages/              Overview, Search, Favourites, StockDetail, Settings

## News collector (`collector/`, GitHub Actions)

`.github/workflows/collect.yml` runs `python -m stk_collector` on the brief's schedule
(every 10 min 09:00–16:50 MYT, every 30 min otherwise). Each run:

1. Reads active watchlist listings and builds pooled Google News RSS searches from company
   names and aliases (never tickers, which collide across markets).
2. Fetches with Scrapling's plain HTTP `Fetcher`: honest user agent, no stealth or bypass, retries with delay.
3. Validates publisher timestamps (missing / future / invalid are flagged; discovery time stored separately).
4. Dedups by canonical URL (L1) and headline fingerprint + publisher (L2) over 72 h.
5. Clusters headlines about the same event (L3, conservative word overlap) and links each
   event to the listings named in the headline. Aliases give medium confidence, legal names high.
6. Records the run in `collector_runs` and source health in `news_sources`. A failed fetch
   never advances `last_success_at`.

Setup: add the repository secret `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → secret key).
Run once by hand from Actions → Collect news → Run workflow.

This repo is public, so Actions logs are public. The collector prints counts only.
GitHub disables scheduled workflows after 60 days without repository activity; re-enable from the Actions tab.

Tests: `cd collector && python -m unittest discover -s tests`.

## Database (Supabase)

Migrations in `supabase/migrations/` (brief §5, Postgres). Run each once, in filename order, in the Supabase SQL Editor.

- Only the owner account (`is_owner()`) can read data; logged-out visitors are refused.
- The browser can change only the watchlist. Collectors write with the secret key, server-side.
- Indirect links must reference a recorded relationship (enforced by a check constraint).
- Turn off public sign-ups in Authentication settings.

## Deploy (Cloudflare Workers, static assets)

Connected to Workers Builds. Settings in the Cloudflare dashboard:

- Deploy command: `npx wrangler deploy` (runs `npm run build` itself via `wrangler.jsonc`)
- Build command: optional

`wrangler.jsonc` serves `dist/` and falls back to `index.html` for app routes. The Worker
name in `wrangler.jsonc` must match the Worker name in the dashboard. Private APIs and
secrets do not go in this static bundle.
