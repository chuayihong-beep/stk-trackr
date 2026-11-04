// Loads the owner's data from Supabase once after sign-in and exposes read helpers.
// The dataset is small (15–30 securities, recent events), so one load plus refresh is enough.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type {
  Article, CollectorRun, EventItem, NewsSource, Quote, Relationship, Security, SecurityEvent, Currency,
} from './types';

const RECENT_DAYS = 30;

interface Snapshot {
  securities: Security[];
  quotes: Quote[]; // latest per security
  sources: NewsSource[];
  runs: CollectorRun[];
  articles: Article[];
  events: EventItem[];
  relationships: Relationship[];
  links: SecurityEvent[];
  watchlist: string[];
}

const EMPTY: Snapshot = {
  securities: [], quotes: [], sources: [], runs: [], articles: [], events: [], relationships: [], links: [], watchlist: [],
};

export interface NewListing {
  company: string;
  symbol: string;
  exchangeMic: string;
  exchangeName: string;
  currency: string;
  country: string;
  sector?: string;
  isin?: string;
  aliases?: string; // comma-separated
  sourceIds?: Record<string, unknown>;
}

/** One result from the Worker's /api/symbol-search (provider-neutral shape). */
export interface ListingCandidate {
  provider: string;
  symbol: string;
  name: string;
  exchange: string;
  micCode: string;
  country: string | null;
  countryName: string;
  currency: string;
  timezone: string;
  type: string;
  priceAccess: string | null;
}

export interface EventLink { event: EventItem; link: SecurityEvent }

interface StoreValue extends Snapshot {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  loadedAt: Date | null;
  reload: () => Promise<void>;
  getSecurity: (id: string) => Security | undefined;
  getQuote: (securityId: string) => Quote | undefined;
  getArticle: (id: string) => Article | undefined;
  getRelationship: (id?: string) => Relationship | undefined;
  eventsFor: (securityId: string) => EventLink[];
  latestEvents: (limit?: number) => EventItem[];
  linksForEvent: (eventId: string) => SecurityEvent[];
  searchSecurities: (q: string) => Security[];
  searchEvents: (q: string) => EventItem[];
  isWatched: (id: string) => boolean;
  addToWatchlist: (id: string) => Promise<string | null>;
  removeFromWatchlist: (id: string) => Promise<string | null>;
  addListing: (l: NewListing) => Promise<{ error: string | null; id?: string }>;
  updateAliases: (id: string, aliases: string) => Promise<string | null>;
  searchMarkets: (q: string) => Promise<{ error: string | null; results: ListingCandidate[] }>;
  findListing: (symbol: string, micCode: string) => Security | undefined;
}

const Ctx = createContext<StoreValue | null>(null);

function parseAliases(text: string | undefined): string[] {
  const seen = new Set<string>();
  return (text ?? '').split(',').map((a) => a.trim()).filter((a) => {
    const k = a.toLowerCase();
    if (a.length < 3 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Row → app type mappers (snake_case → camelCase).
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const toSecurity = (r: Row): Security => ({
  id: r.id, company: r.company, symbol: r.symbol, exchangeMic: r.exchange_mic, exchangeName: r.exchange_name,
  currency: r.currency as Currency, country: r.country, isin: r.isin ?? undefined, sector: r.sector ?? '',
  aliases: r.aliases ?? [],
  priceProvider: r.price_provider ?? null, priceStatus: r.price_status ?? null,
});
const toQuote = (r: Row): Quote => ({
  securityId: r.security_id, value: Number(r.value), currency: r.currency, marketAt: r.market_at,
  ingestedAt: r.ingested_at, provider: r.provider, delayed: r.is_delayed,
});
const toSource = (r: Row): NewsSource => ({
  id: r.id, name: r.name, type: r.type, status: r.status, lastSuccessAt: r.last_success_at,
  lastError: r.last_error ?? undefined, quotaUsed: r.quota_used ?? undefined, quotaCap: r.quota_cap ?? undefined,
});
const toRun = (r: Row): CollectorRun => ({
  id: String(r.id), startedAt: r.started_at,
  durationSec: r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : 0,
  status: r.status === 'running' ? 'partial' : r.status, sourceId: r.source_id ?? '',
  newArticles: r.new_articles, duplicatesRemoved: r.duplicates_removed,
});
const toArticle = (r: Row): Article => ({
  id: r.id, url: r.canonical_url, title: r.title, publisher: r.publisher, publishedAt: r.published_at,
  publishedVerified: r.published_verified, timestampFlag: r.timestamp_flag ?? undefined,
  updatedAt: r.source_updated_at ?? undefined, firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at,
  sourceId: r.source_id ?? '',
});
const toRelationship = (r: Row): Relationship => ({
  id: r.id, securityId: r.security_id, kind: r.kind, label: r.label, evidence: r.evidence ?? [], verifiedAt: r.verified_at,
});
const toLink = (r: Row): SecurityEvent => ({
  securityId: r.security_id, eventId: r.event_id, type: r.type, relationshipId: r.relationship_id ?? undefined,
  confidence: r.confidence, why: r.why, evidence: r.evidence ?? [],
});

async function loadAll(): Promise<Snapshot> {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  const [sec, wl, px, src, runs, ev, rel, links] = await Promise.all([
    supabase.from('securities').select('*').order('company'),
    supabase.from('watchlist').select('security_id, saved_at').eq('active', true).order('saved_at'),
    supabase.from('price_snapshots').select('*').order('market_at', { ascending: false }).limit(500),
    supabase.from('news_sources').select('*').order('name'),
    supabase.from('collector_runs').select('*').order('started_at', { ascending: false }).limit(20),
    supabase.from('events').select('id, title, summary, themes, first_seen_at, event_articles(article_id)')
      .gte('first_seen_at', since).order('first_seen_at', { ascending: false }).limit(300),
    supabase.from('security_relationships').select('*'),
    supabase.from('security_events').select('*'),
  ]);
  const firstError = [sec, wl, px, src, runs, ev, rel, links].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const events: EventItem[] = (ev.data ?? []).map((r: Row) => ({
    id: r.id, title: r.title, summary: r.summary ?? '', themes: r.themes ?? [], firstSeenAt: r.first_seen_at,
    articleIds: (r.event_articles ?? []).map((x: Row) => x.article_id),
  }));
  const articleIds = [...new Set(events.flatMap((e) => e.articleIds))];
  let articles: Article[] = [];
  if (articleIds.length) {
    const { data, error } = await supabase.from('articles')
      .select('id, canonical_url, title, publisher, source_id, published_at, published_verified, timestamp_flag, source_updated_at, first_seen_at, last_seen_at')
      .in('id', articleIds);
    if (error) throw new Error(error.message);
    articles = (data ?? []).map(toArticle);
  }

  // Keep only the latest quote per security.
  const latest = new Map<string, Quote>();
  for (const r of px.data ?? []) if (!latest.has(r.security_id)) latest.set(r.security_id, toQuote(r));

  return {
    securities: (sec.data ?? []).map(toSecurity),
    quotes: [...latest.values()],
    sources: (src.data ?? []).map(toSource),
    runs: (runs.data ?? []).map(toRun),
    articles,
    events,
    relationships: (rel.data ?? []).map(toRelationship),
    links: (links.data ?? []).map(toLink),
    watchlist: (wl.data ?? []).map((r: Row) => r.security_id),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const reload = useCallback(async () => {
    try {
      const s = await loadAll();
      setSnap(s);
      setStatus('ready');
      setError(null);
      setLoadedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<StoreValue>(() => {
    const secById = new Map(snap.securities.map((s) => [s.id, s]));
    const evById = new Map(snap.events.map((e) => [e.id, e]));
    const artById = new Map(snap.articles.map((a) => [a.id, a]));
    const relById = new Map(snap.relationships.map((r) => [r.id, r]));
    const quoteById = new Map(snap.quotes.map((q) => [q.securityId, q]));
    const match = (q: string, fields: (string | undefined)[]) => {
      const n = q.trim().toLowerCase();
      return fields.some((f) => f?.toLowerCase().includes(n));
    };

    return {
      ...snap, status, error, loadedAt, reload,
      getSecurity: (id) => secById.get(id),
      getQuote: (id) => quoteById.get(id),
      getArticle: (id) => artById.get(id),
      getRelationship: (id) => (id ? relById.get(id) : undefined),
      eventsFor: (securityId) => snap.links
        .filter((l) => l.securityId === securityId && evById.has(l.eventId))
        .map((link) => ({ link, event: evById.get(link.eventId)! }))
        .sort((a, b) => b.event.firstSeenAt.localeCompare(a.event.firstSeenAt)),
      latestEvents: (limit = 10) => snap.events.slice(0, limit),
      linksForEvent: (eventId) => snap.links.filter((l) => l.eventId === eventId),
      searchSecurities: (q) => (q.trim()
        ? snap.securities.filter((s) => match(q, [s.company, s.symbol, s.exchangeName, s.exchangeMic, s.country, s.sector, ...s.aliases]))
        : snap.securities),
      searchEvents: (q) => (q.trim() ? snap.events.filter((e) => match(q, [e.title, e.summary, ...e.themes])) : []),
      isWatched: (id) => snap.watchlist.includes(id),

      addToWatchlist: async (id) => {
        setSnap((s) => (s.watchlist.includes(id) ? s : { ...s, watchlist: [...s.watchlist, id] }));
        const { error: err } = await supabase.from('watchlist').upsert({ security_id: id, active: true });
        if (err) {
          setSnap((s) => ({ ...s, watchlist: s.watchlist.filter((x) => x !== id) }));
          return err.message;
        }
        return null;
      },
      removeFromWatchlist: async (id) => {
        const before = snap.watchlist;
        setSnap((s) => ({ ...s, watchlist: s.watchlist.filter((x) => x !== id) }));
        const { error: err } = await supabase.from('watchlist').delete().eq('security_id', id);
        if (err) {
          setSnap((s) => ({ ...s, watchlist: before }));
          return err.message;
        }
        return null;
      },
      addListing: async (l) => {
        const { data, error: err } = await supabase.from('securities').insert({
          company: l.company.trim(),
          symbol: l.symbol.trim().toUpperCase(),
          exchange_mic: l.exchangeMic.trim().toUpperCase(),
          exchange_name: l.exchangeName.trim(),
          currency: l.currency.trim().toUpperCase(),
          country: l.country.trim().toUpperCase(),
          sector: l.sector?.trim() || null,
          isin: l.isin?.trim().toUpperCase() || null,
          aliases: parseAliases(l.aliases),
          source_ids: l.sourceIds ?? {},
        }).select('*').single();
        if (err) {
          return { error: err.code === '23505' ? 'That symbol is already registered on this exchange.' : err.message };
        }
        setSnap((s) => ({
          ...s,
          securities: [...s.securities, toSecurity(data)].sort((a, b) => a.company.localeCompare(b.company)),
        }));
        return { error: null, id: data.id as string };
      },
      updateAliases: async (id, aliases) => {
        const list = parseAliases(aliases);
        const { error: err } = await supabase.from('securities').update({ aliases: list }).eq('id', id);
        if (err) return err.message;
        setSnap((s) => ({ ...s, securities: s.securities.map((x) => (x.id === id ? { ...x, aliases: list } : x)) }));
        return null;
      },
      searchMarkets: async (q) => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return { error: 'Sign in again to search.', results: [] };
        try {
          const r = await fetch(`/api/symbol-search?q=${encodeURIComponent(q)}`, {
            headers: { authorization: `Bearer ${token}` },
          });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) return { error: body.error ?? `Search failed (${r.status}).`, results: [] };
          return { error: null, results: body.results ?? [] };
        } catch {
          return { error: 'Search service unreachable.', results: [] };
        }
      },
      findListing: (symbol, micCode) =>
        snap.securities.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase() && s.exchangeMic === micCode.toUpperCase()),
    };
  }, [snap, status, error, loadedAt, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
