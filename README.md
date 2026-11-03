# Stock Intelligence Dashboard (MVP front end)

Front end for the Stock Intelligence brief (v1.0). It implements the five MVP screens against
sample data, so the UI can be used and reviewed before the collectors and Worker API exist.

## Run

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # type-check + production build to dist/
    npm run preview

## What is real vs sample

| Area | Status in this build |
|---|---|
| Overview, Search, Favourites, Stock detail, Settings | Implemented against the brief's functionality table (§3) |
| Listing identity (symbol + exchange MIC + currency) | Implemented; duplicate ticker "KHE" on NYSE and Bursa shown on purpose |
| Times: stored UTC, shown MYT | Implemented (`src/lib/time.ts`) |
| Collection schedule (10 min 09:00–16:50 MYT, 30 min otherwise) | Implemented as a rule; counts 48 + 32 = 80 per day; next-run shown |
| Direct vs indirect links, "why" and evidence, confidence | Implemented; relevance kept separate from freshness and evidence |
| Publisher time vs first-seen time, verified/missing/future flags | Implemented (never substitutes first-seen for publication date) |
| "Price unavailable" / "Last quote as of …" / stale labels | Implemented |
| Watchlist persistence | localStorage only (per browser). Stage 2 moves it to D1 |
| Companies, quotes, articles, events, sources | **Sample data** in `src/data/seed.ts`. All companies are fictional |
| Collectors, dedup, clustering, relationships | Not built. Stage 3–4 |
| Live search/discovery, auth, Worker API, D1 | Not built. Stage 1, 3 |

## Structure

    src/
      lib/types.ts        data model (brief §5)
      lib/time.ts         MYT formatting, freshness, collection schedule
      lib/data.ts         read-model helpers; swap for API calls in Stage 5
      lib/watchlist.tsx   watchlist store
      data/seed.ts        SAMPLE dataset
      components/         badges, layout, event card
      pages/              Overview, Search, Favourites, StockDetail, Settings

## Replacing sample data with the real API

Keep the types in `lib/types.ts`. Replace the functions in `lib/data.ts` with fetches to the
Worker (for example `GET /api/overview`, `GET /api/securities/:id`). Keep the watchlist in the
Worker and call it from `lib/watchlist.tsx`. Add a login gate in front of all routes (single owner).

## Database (Supabase)

Schema: `supabase/migrations/20261103000000_initial_schema.sql` (brief §5, Postgres).

- Run it once in the Supabase SQL Editor.
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
