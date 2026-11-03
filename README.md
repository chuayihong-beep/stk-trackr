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
| News collector (Scrapling / RSS / GDELT), dedup, clustering | Next |
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
