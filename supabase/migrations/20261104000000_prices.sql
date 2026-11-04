-- Delayed prices (brief §7): per-listing provider routing and a private collector cache.
-- Safe to run more than once.

-- Which provider serves this listing's price, and whether coverage was found.
alter table public.securities
  add column if not exists price_provider   text check (price_provider in ('twelvedata', 'eodhd', 'none')),
  add column if not exists price_status     text check (price_status in ('ok', 'unsupported', 'error')),
  add column if not exists price_checked_at timestamptz;

-- Collector-only cache (daily provider usage counters, exchange code lists). Not readable by the browser.
create table if not exists public.app_cache (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_cache enable row level security;
grant all on public.app_cache to service_role;

notify pgrst, 'reload schema';
