import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, Radar } from 'lucide-react';
import { EventCard } from '../components/EventCard';
import { ListingLabel } from '../components/Badges';
import { useStore, type NewListing } from '../lib/store';

const BLANK: NewListing = { company: '', symbol: '', exchangeMic: '', exchangeName: '', currency: '', country: '', sector: '', isin: '', aliases: '' };

export function Search() {
  const [q, setQ] = useState('');
  const { searchSecurities, searchEvents, isWatched, addToWatchlist, removeFromWatchlist, securities } = useStore();
  const results = useMemo(() => searchSecurities(q), [q, searchSecurities]);
  const events = useMemo(() => searchEvents(q), [q, searchEvents]);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggle = async (id: string) => {
    setActionError(await (isWatched(id) ? removeFromWatchlist(id) : addToWatchlist(id)));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Search</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search your registered listings by company, ticker, exchange or country. Tickers repeat across exchanges, so check the listing before adding.
        </p>
        <label htmlFor="q" className="sr-only">Search securities and events</label>
        <input
          id="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Maybank, AAPL, Bursa, copper"
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 md:max-w-xl"
        />
      </div>

      <section aria-labelledby="sec-h" className="space-y-2">
        <h2 id="sec-h" className="text-sm font-semibold text-slate-700">Listings ({results.length})</h2>
        {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
        {securities.length === 0 && <p className="text-sm text-slate-500">No listings registered yet. Add one below.</p>}
        {securities.length > 0 && results.length === 0 && <p className="text-sm text-slate-500">No registered listing matches. Add it below.</p>}
        {results.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {results.map((s) => {
              const watched = isWatched(s.id);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link to={`/stock/${s.id}`} className="font-medium hover:underline">{s.company}</Link>
                    <div className="mt-1"><ListingLabel s={s} /></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggle(s.id)}
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
        )}
      </section>

      {q.trim() && (
        <section aria-labelledby="ev-h" className="space-y-3">
          <h2 id="ev-h" className="text-sm font-semibold text-slate-700">Cached events ({events.length})</h2>
          {events.map((e) => <EventCard key={e.id} event={e} />)}
          {events.length === 0 && <p className="text-sm text-slate-500">No cached events match.</p>}
        </section>
      )}

      <AddListing />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
        <div className="text-sm text-slate-600">
          <div className="font-medium text-slate-800">Bounded live discovery</div>
          Requests a fresh search across permitted feeds, subject to rate limits. Arrives with the collector.
        </div>
        <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400">
          <Radar className="h-4 w-4" aria-hidden /> Refresh (unavailable)
        </button>
      </section>
    </div>
  );
}

function AddListing() {
  const { addListing, addToWatchlist } = useStore();
  const [form, setForm] = useState<NewListing>(BLANK);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const set = (k: keyof NewListing) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error, id } = await addListing(form);
    setBusy(false);
    setNewId(id ?? null);
    if (error) {
      setMsg({ kind: 'err', text: error });
      return;
    }
    setMsg({ kind: 'ok', text: `${form.symbol.toUpperCase()} on ${form.exchangeMic.toUpperCase()} registered.` });
    setForm(BLANK);
  };


  const field = (k: keyof NewListing, label: string, opts: { placeholder?: string; required?: boolean; pattern?: string; maxLength?: number; hint?: string } = {}) => (
    <label className="block text-sm">
      <span className="text-slate-700">{label}{opts.required === false ? <span className="text-slate-400"> (optional)</span> : ''}</span>
      <input
        value={form[k] ?? ''}
        onChange={set(k)}
        required={opts.required !== false}
        placeholder={opts.placeholder ? `e.g. ${opts.placeholder}` : undefined}
        pattern={opts.pattern}
        maxLength={opts.maxLength}
        title={opts.hint}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );

  return (
    <section aria-labelledby="add-h" className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="add-h" className="text-sm font-semibold text-slate-800">Register a listing</h2>
      <p className="mt-1 text-xs text-slate-500">
        Manual entry until symbol search is connected. Use the exchange's MIC code, e.g. XKLS (Bursa Malaysia), XNAS (Nasdaq), XNYS (NYSE), XHKG (Hong Kong), XSES (Singapore).
      </p>
      <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field('company', 'Company', { placeholder: 'Malayan Banking Berhad' })}
        {field('symbol', 'Symbol', { placeholder: '1155' })}
        {field('exchangeMic', 'Exchange MIC', { placeholder: 'XKLS', pattern: '[A-Za-z0-9]{4}', maxLength: 4, hint: '4-character ISO 10383 code' })}
        {field('exchangeName', 'Exchange name', { placeholder: 'Bursa Malaysia' })}
        {field('currency', 'Currency', { placeholder: 'MYR', pattern: '[A-Za-z]{3}', maxLength: 3, hint: '3-letter ISO 4217 code' })}
        {field('country', 'Country', { placeholder: 'MY', pattern: '[A-Za-z]{2}', maxLength: 2, hint: '2-letter ISO country code' })}
        {field('sector', 'Sector', { required: false, placeholder: 'Banking' })}
        {field('isin', 'ISIN', { required: false, pattern: '[A-Za-z]{2}[A-Za-z0-9]{9}[0-9]', maxLength: 12, hint: '12-character ISIN' })}
        <div className="sm:col-span-2 lg:col-span-4">
          {field('aliases', 'Also known as', { required: false, placeholder: 'Maybank, MBB', hint: 'Comma-separated names used in headlines' })}
          <p className="mt-1 text-xs text-slate-500">Headlines rarely use legal names. The collector matches the company name and these names, not the ticker.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">
            {busy ? 'Saving…' : 'Register listing'}
          </button>
          {msg && <span role="status" className={`text-sm ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
          {msg?.kind === 'ok' && newId && (
            <button type="button" onClick={() => { void addToWatchlist(newId); setMsg(null); setNewId(null); }} className="text-sm text-brand underline">
              Add to watchlist
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
