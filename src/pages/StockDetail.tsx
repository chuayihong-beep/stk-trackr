import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Star, StarOff } from 'lucide-react';
import { EventCard } from '../components/EventCard';
import { ListingLabel, QuoteBlock } from '../components/Badges';
import { useStore } from '../lib/store';
import { formatMYT } from '../lib/time';
import { useNow } from '../lib/useNow';

export function StockDetail() {
  const { id = '' } = useParams();
  const {
    getSecurity, getQuote, eventsFor, relationships,
    isWatched: has, addToWatchlist: add, removeFromWatchlist: remove,
  } = useStore();
  const s = getSecurity(id);
  const now = useNow();

  if (!s) {
    return (
      <div className="space-y-3">
        <p className="text-sm">No listing found with that ID.</p>
        <Link to="/search" className="text-brand underline">Back to search</Link>
      </div>
    );
  }

  const links = eventsFor(s.id);
  const direct = links.filter((x) => x.link.type === 'direct');
  const indirect = links.filter((x) => x.link.type === 'indirect');
  const rels = relationships.filter((r) => r.securityId === s.id);
  const watched = has(s.id);

  return (
    <div className="space-y-6">
      <Link to="/favourites" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{s.company}</h1>
          <div className="mt-1.5"><ListingLabel s={s} /></div>
          <div className="mt-1 text-xs text-slate-500">Country {s.country}{s.sector ? ` · ${s.sector}` : ''}{s.isin ? ` · ISIN ${s.isin}` : ''}</div>
          {s.aliases.length > 0 && <div className="mt-1 text-xs text-slate-500">Also matched as: {s.aliases.join(', ')}</div>}
          <p className="mt-3 text-xs text-slate-500">
            Ticker “{s.symbol}” is not unique worldwide. This page is for this listing only.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <QuoteBlock s={s} quote={getQuote(s.id)} now={now} />
          <button
            type="button"
            onClick={() => void (watched ? remove(s.id) : add(s.id))}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            {watched ? <><StarOff className="h-4 w-4" aria-hidden /> Remove from watchlist</> : <><Star className="h-4 w-4" aria-hidden /> Add to watchlist</>}
          </button>
        </div>
      </header>

      <section aria-labelledby="direct-h" className="space-y-3">
        <h2 id="direct-h" className="text-base font-semibold">Direct coverage ({direct.length})</h2>
        {direct.length === 0 && <p className="text-sm text-slate-500">No direct coverage cached for this listing.</p>}
        {direct.map((x) => <EventCard key={x.event.id} event={x.event} forSecurity={x.link} />)}
      </section>

      <section aria-labelledby="indirect-h" className="space-y-3">
        <h2 id="indirect-h" className="text-base font-semibold">Indirect links ({indirect.length})</h2>
        <p className="text-sm text-slate-600">Events that may matter through a sector, commodity, supplier or geographic link. Each one states why and what evidence supports it.</p>
        {indirect.length === 0 && <p className="text-sm text-slate-500">No indirect links yet.</p>}
        {indirect.map((x) => <EventCard key={x.event.id} event={x.event} forSecurity={x.link} />)}
      </section>

      <section aria-labelledby="rel-h" className="space-y-3">
        <h2 id="rel-h" className="text-base font-semibold">Verified relationships</h2>
        {rels.length === 0 && <p className="text-sm text-slate-500">No verified relationships recorded.</p>}
        <ul className="space-y-2">
          {rels.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-600">{r.kind}</span>
                <span className="font-medium">{r.label}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">Verified {formatMYT(r.verifiedAt)}</div>
              <ul className="mt-2 list-inside list-disc text-xs">
                {r.evidence.map((e) => (
                  <li key={e.url}><a className="text-brand hover:underline" href={e.url} target="_blank" rel="noreferrer noopener">{e.label}</a></li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
