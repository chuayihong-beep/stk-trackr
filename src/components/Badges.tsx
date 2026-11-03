import { formatMYT, relativeTime, freshnessLevel } from '../lib/time';
import type { Article, Quote, Security, SourceStatus } from '../lib/types';
import { isQuoteStale, formatPrice } from '../lib/data';

// Relevance (direct vs indirect) is shown separately from freshness and evidence strength (brief §6).
export function RelevanceBadge({ type }: { type: 'direct' | 'indirect' }) {
  return type === 'direct' ? (
    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-direct ring-1 ring-inset ring-blue-200">
      Direct
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-indirect ring-1 ring-inset ring-violet-200">
      Indirect link
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    medium: 'bg-amber-50 text-amber-700 ring-amber-200',
    low: 'bg-slate-100 text-slate-600 ring-slate-200',
  } as const;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[level]}`}>
      Evidence: {level}
    </span>
  );
}

export function FreshnessBadge({ iso, now }: { iso: string | null | undefined; now: Date }) {
  const level = freshnessLevel(iso, now);
  const cls =
    level === 'fresh' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : level === 'stale' ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-slate-100 text-slate-600 ring-slate-200';
  const label = level === 'fresh' ? 'Fresh' : level === 'stale' ? 'Stale' : 'No data';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label} · {relativeTime(iso, now)}
    </span>
  );
}

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  const map = {
    ok: ['bg-emerald-500', 'Healthy'],
    degraded: ['bg-amber-500', 'Degraded'],
    failing: ['bg-red-500', 'Failing'],
  } as const;
  const [dot, label] = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

/** Listing identity: company + exchange + currency, because tickers are not unique worldwide. */
export function ListingLabel({ s }: { s: Security }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{s.symbol}</span>
      <span>{s.exchangeName} ({s.exchangeMic})</span>
      <span>· {s.currency}</span>
    </span>
  );
}

export function QuoteBlock({ s, quote, now }: { s: Security; quote: Quote | undefined; now: Date }) {
  if (!quote) {
    return (
      <div>
        <div className="text-lg font-semibold text-slate-400">Price unavailable</div>
        <div className="text-xs text-slate-500">No supported delayed quote for {s.exchangeName}.</div>
      </div>
    );
  }
  const stale = isQuoteStale(quote, now);
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">{formatPrice(quote.value, quote.currency)}</div>
      <div className={`text-xs ${stale ? 'text-amber-700' : 'text-slate-500'}`}>
        Last quote as of {formatMYT(quote.marketAt)} · {quote.delayed ? 'delayed / end-of-day' : 'live'}
        {stale ? ' · stale' : ''}
      </div>
      <div className="text-[11px] text-slate-400">Source: {quote.provider}</div>
    </div>
  );
}

export function TimestampFlag({ article }: { article: Article }) {
  if (article.publishedVerified) {
    return <span className="text-xs text-emerald-700">Publisher time verified</span>;
  }
  const why = article.timestampFlag === 'future' ? 'future-dated'
    : article.timestampFlag === 'invalid' ? 'invalid' : 'missing';
  return <span className="text-xs text-amber-700">Publisher time {why}. Shown with collection time only.</span>;
}
