import { Link } from 'react-router-dom';
import { Star, Clock } from 'lucide-react';
import { EventCard } from '../components/EventCard';
import { FreshnessBadge, ListingLabel, QuoteBlock, SourceStatusBadge } from '../components/Badges';
import { eventsFor, getQuote, getRuns, getSecurity, getSources, latestEvents } from '../lib/data';
import { useWatchlist } from '../lib/watchlist';
import { formatMYT, nextCollectionRun, relativeTime } from '../lib/time';
import { useNow } from '../lib/useNow';

export function Overview() {
  const { ids } = useWatchlist();
  const now = useNow();
  const watched = ids.map(getSecurity).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const sources = getSources();
  const healthy = sources.filter((s) => s.status === 'ok').length;
  const nextRun = nextCollectionRun(now);
  const directCount = watched.reduce((n, s) => n + eventsFor(s.id).filter((x) => x.link.type === 'direct').length, 0);
  const indirectCount = watched.reduce((n, s) => n + eventsFor(s.id).filter((x) => x.link.type === 'indirect').length, 0);
  const lastRun = getRuns()[0];

  return (
    <div className="space-y-8">
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Watching" value={String(watched.length)} sub="securities saved" />
        <Kpi label="Direct coverage" value={String(directCount)} sub="watchlist event links" />
        <Kpi label="Indirect links" value={String(indirectCount)} sub="with stated evidence" />
        <Kpi label="Sources healthy" value={`${healthy}/${sources.length}`} sub={`next run ${formatMYT(nextRun.toISOString()).replace(' MYT', '')}`} />
      </section>

      <section aria-labelledby="watch-h">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="watch-h" className="text-base font-semibold">Watchlist</h2>
          <Link to="/search" className="text-sm text-brand hover:underline">Add securities</Link>
        </div>
        {watched.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            <Star className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden />
            Your watchlist is empty. <Link to="/search" className="text-brand underline">Search</Link> for a company to start.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {watched.map((s) => {
              const count = eventsFor(s.id).length;
              return (
                <Link key={s.id} to={`/stock/${s.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow">
                  <div className="font-semibold leading-snug">{s.company}</div>
                  <div className="mt-1"><ListingLabel s={s} /></div>
                  <div className="mt-3"><QuoteBlock s={s} quote={getQuote(s.id)} now={now} /></div>
                  <div className="mt-3 text-xs text-slate-500">{count} linked event{count === 1 ? '' : 's'}</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section aria-labelledby="events-h" className="space-y-3 lg:col-span-2">
          <h2 id="events-h" className="text-base font-semibold">Latest events</h2>
          {latestEvents(8).map((e) => <EventCard key={e.id} event={e} />)}
        </section>

        <section aria-labelledby="status-h" className="space-y-3">
          <h2 id="status-h" className="text-base font-semibold">Collection status</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="mb-3 flex items-center gap-2 text-slate-600">
              <Clock className="h-4 w-4" aria-hidden /> Last run {relativeTime(lastRun?.startedAt, now)} · {lastRun?.status}
            </div>
            <ul className="divide-y divide-slate-100">
              {sources.map((src) => (
                <li key={src.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{src.name}</span>
                    <SourceStatusBadge status={src.status} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Last success <FreshnessBadge iso={src.lastSuccessAt} now={now} />
                  </div>
                  {src.lastError && <div className="mt-1 text-xs text-amber-700">{src.lastError}</div>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
