import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { ListingLabel, QuoteBlock } from '../components/Badges';
import { eventsFor, getQuote, getSecurity } from '../lib/data';
import { useWatchlist } from '../lib/watchlist';
import { useNow } from '../lib/useNow';

export function Favourites() {
  const { ids, remove } = useWatchlist();
  const now = useNow();
  const watched = ids.map(getSecurity).filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Favourites</h1>
        <p className="mt-1 text-sm text-slate-600">{watched.length} of 15–30 target securities. Changes apply immediately.</p>
      </div>
      {watched.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No securities yet. <Link to="/search" className="text-brand underline">Search</Link> to add some.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {watched.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Link to={`/stock/${s.id}`} className="font-medium hover:underline">{s.company}</Link>
                <div className="mt-1"><ListingLabel s={s} /></div>
                <div className="mt-2 text-xs text-slate-500">{eventsFor(s.id).length} linked events</div>
              </div>
              <div className="min-w-[14rem]"><QuoteBlock s={s} quote={getQuote(s.id)} now={now} /></div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                aria-label={`Remove ${s.company} (${s.exchangeMic})`}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
