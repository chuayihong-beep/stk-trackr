-- Stock Intelligence: initial schema (brief §5), Postgres / Supabase.
-- Run once in Supabase SQL Editor, or with `supabase db push`.
-- All timestamps are timestamptz (UTC); the app renders them in MYT.

-- ---------------------------------------------------------------------------
-- Owner check. Single private user: only this account may read or change data.
-- Also turn OFF public sign-ups in Authentication settings.
-- ---------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'email') = 'chua.yihong@gmail.com', false)
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Canonical listing identity. Tickers are not unique worldwide, so (symbol, exchange_mic) is.
create table public.securities (
  id            uuid primary key default gen_random_uuid(),
  company       text not null,
  symbol        text not null,
  exchange_mic  text not null check (exchange_mic ~ '^[A-Z0-9]{4}$'),
  exchange_name text not null,
  currency      char(3) not null check (currency ~ '^[A-Z]{3}$'),
  country       char(2) not null check (country ~ '^[A-Z]{2}$'),
  isin          char(12) check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  sector        text,
  source_ids    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (symbol, exchange_mic)
);

create table public.watchlist (
  security_id uuid primary key references public.securities(id) on delete cascade,
  active      boolean not null default true,
  saved_at    timestamptz not null default now(),
  notes       text
);

create table public.price_snapshots (
  id          bigint generated always as identity primary key,
  security_id uuid not null references public.securities(id) on delete cascade,
  value       numeric(20, 6) not null,
  currency    char(3) not null,
  market_at   timestamptz not null,         -- quote time reported by the provider
  ingested_at timestamptz not null default now(),
  provider    text not null,
  is_delayed  boolean not null default true -- delayed or end-of-day; never implies live
);
create index price_snapshots_latest on public.price_snapshots (security_id, market_at desc);

create table public.news_sources (
  id              text primary key,
  name            text not null,
  type            text not null check (type in ('RSS', 'API', 'HTML')),
  url             text,
  fetch_policy    jsonb not null default '{}'::jsonb,
  status          text not null default 'ok' check (status in ('ok', 'degraded', 'failing')),
  etag            text,
  last_modified   text,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error      text,
  quota_used      integer,
  quota_cap       integer
);

create table public.articles (
  id                 uuid primary key default gen_random_uuid(),
  canonical_url      text not null unique,     -- dedup level 1
  title              text not null,
  title_fingerprint  text not null,            -- dedup level 2
  publisher          text not null,
  source_id          text references public.news_sources(id),
  published_at       timestamptz,              -- publisher-stated; may be null
  published_verified boolean not null default false,
  timestamp_flag     text check (timestamp_flag in ('missing', 'future', 'invalid')),
  source_updated_at  timestamptz,
  first_seen_at      timestamptz not null default now(), -- collector discovery; never a publication date
  last_seen_at       timestamptz not null default now(),
  search             tsvector generated always as (
                       to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(publisher, ''))
                     ) stored,
  check (not published_verified or published_at is not null)
);
create index articles_fingerprint on public.articles (title_fingerprint, publisher);
create index articles_first_seen on public.articles (first_seen_at desc);
create index articles_search on public.articles using gin (search);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  summary       text,
  themes        text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  search        tsvector generated always as (
                  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, ''))
                ) stored
);
create index events_first_seen on public.events (first_seen_at desc);
create index events_search on public.events using gin (search);

create table public.event_articles (
  event_id   uuid not null references public.events(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  primary key (event_id, article_id)
);

create table public.security_relationships (
  id          uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities(id) on delete cascade,
  kind        text not null check (kind in ('sector', 'commodity', 'supplier', 'customer', 'geography', 'regulatory')),
  label       text not null,
  evidence    jsonb not null default '[]'::jsonb,  -- [{label, url}]
  verified_at timestamptz not null
);

create table public.security_events (
  security_id     uuid not null references public.securities(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  type            text not null check (type in ('direct', 'indirect')),
  relationship_id uuid references public.security_relationships(id) on delete set null,
  confidence      text not null check (confidence in ('high', 'medium', 'low')),
  why             text not null,                    -- "Why is this relevant to this security?"
  evidence        jsonb not null default '[]'::jsonb,
  primary key (security_id, event_id),
  -- Brief §6: every indirect link must rest on a recorded relationship.
  check (type = 'direct' or relationship_id is not null)
);

create table public.collector_runs (
  id                 bigint generated always as identity primary key,
  source_id          text references public.news_sources(id),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  status             text not null check (status in ('running', 'success', 'partial', 'failed')),
  new_articles       integer not null default 0,
  duplicates_removed integer not null default 0,
  retries            integer not null default 0,
  error              text
);
create index collector_runs_started on public.collector_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Access. "Automatically expose new tables" is off, so grant explicitly.
-- The browser (authenticated owner) reads everything and edits only the watchlist.
-- The collector uses the service_role key, which bypasses RLS; it never ships to the browser.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;

grant select on
  public.securities, public.watchlist, public.price_snapshots, public.news_sources,
  public.articles, public.events, public.event_articles, public.security_relationships,
  public.security_events, public.collector_runs
to authenticated;
grant insert, update, delete on public.watchlist to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.is_owner() to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'securities', 'watchlist', 'price_snapshots', 'news_sources', 'articles', 'events',
    'event_articles', 'security_relationships', 'security_events', 'collector_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (public.is_owner())', t);
  end loop;
end $$;

create policy owner_insert on public.watchlist for insert to authenticated with check (public.is_owner());
create policy owner_update on public.watchlist for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_delete on public.watchlist for delete to authenticated using (public.is_owner());
