import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, Radar } from 'lucide-react';
import { EventCard } from '../components/EventCard';
import { ListingLabel } from '../components/Badges';
import { searchEvents, searchSecurities } from '../lib/data';
import { useWatchlist } from '../lib/watchlist';

export function Search() {
  const [q, setQ] = useState('');
  const { has, add, remove } = useWatchlist();
  const securities = useMemo(() => searchSecurities(q), [q]);
  const events = useMemo(() => searchEvents(q), [q]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Search</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search by company, ticker, exchange or country. Tickers repeat across exchanges, so always check the listing before adding.
        </p>
        <label htmlFor="q" className="sr-only">Search securities and events</label>
        <input
          id="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. KHE, copper, Bursa, lithium"
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 md:max-w-xl"
        />
      </div>

      <section aria-labelledby="sec-h" className="space-y-2">
        <h2 id="sec-h" className="text-sm font-semibold text-slate-700">Securities ({securities.length})</h2>
        {securities.length === 0 && <p className="text-sm text-slate-500">No matching listings in the local cache.</p>}
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {securities.map((s) => {
            const watched = has(s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link to={`/stock/${s.id}`} className="font-medium hover:underline">{s.company}</Link>
                  <div className="mt-1"><ListingLabel s={s} /></div>
                </div>
                <button
                  type="button"
                  onClick={() => (watched ? remove(s.id) : add(s.id))}
                  aria-pressed={watched}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                    watched ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-slate-900 text-white hover:bg-slate-700'
                  }`}
                >
                  {watched ? <><Check className="h-4 w-4" aria-hidden /> Watching</> : <><Plus className="h-4 w-4" aria-hidden /> Add</>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {q.trim() && (
        <section aria-labelledby="ev-h" className="space-y-3">
          <h2 id="ev-h" className="text-sm font-semibold text-slate-700">Cached events ({events.length})</h2>
          {events.map((e) => <EventCard key={e.id} event={e} />)}
          {events.length === 0 && <p className="text-sm text-slate-500">No cached events match.</p>}
        </section>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
        <div className="text-sm text-slate-600">
          <div className="font-medium text-slate-800">Bounded live discovery</div>
          Requests a fresh search across permitted feeds, subject to rate limits. Needs the Worker API (Stage 3).
        </div>
        <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400">
          <Radar className="h-4 w-4" aria-hidden /> Refresh (unavailable)
        </button>
      </section>
    </div>
  );
}
