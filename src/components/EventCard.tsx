import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { ConfidenceBadge, RelevanceBadge, TimestampFlag } from './Badges';
import { formatMYT, relativeTime } from '../lib/time';
import { useStore } from '../lib/store';
import type { EventItem, SecurityEvent } from '../lib/types';
import { useNow } from '../lib/useNow';
import { Link } from 'react-router-dom';

interface Props {
  event: EventItem;
  /** When shown on a stock page, the link for that stock is passed so "why" is shown. */
  forSecurity?: SecurityEvent;
  defaultOpen?: boolean;
}

export function EventCard({ event, forSecurity, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const now = useNow();
  const { getArticle, getRelationship, getSecurity, linksForEvent } = useStore();
  const articles = event.articleIds.map(getArticle).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const links = linksForEvent(event.id);
  const outlets = new Set(articles.map((a) => a.publisher)).size;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {forSecurity && <RelevanceBadge type={forSecurity.type} />}
            {event.themes.map((t) => (
              <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t}</span>
            ))}
          </div>
          <h3 className="mt-1.5 font-semibold text-slate-900">{event.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{event.summary}</p>
          {forSecurity && (
            <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
              <span className="font-medium">Why for this stock: </span>{forSecurity.why}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            First seen {relativeTime(event.firstSeenAt, now)} · {articles.length} article{articles.length === 1 ? '' : 's'} from {outlets} outlet{outlets === 1 ? '' : 's'}
          </p>
        </div>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {forSecurity && (
            <div className={`rounded-lg p-3 text-sm ${forSecurity.type === 'indirect' ? 'bg-violet-50/60' : 'bg-blue-50/60'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Why this is relevant</span>
                <ConfidenceBadge level={forSecurity.confidence} />
              </div>
              <p className="mt-1 text-slate-700">{forSecurity.why}</p>
              {forSecurity.type === 'indirect' && forSecurity.relationshipId && (
                <p className="mt-2 text-xs text-slate-600">
                  Relationship: {getRelationship(forSecurity.relationshipId)?.label}
                  {' '}(verified {formatMYT(getRelationship(forSecurity.relationshipId)?.verifiedAt)})
                </p>
              )}
              {forSecurity.type === 'indirect' && (
                <p className="mt-2 text-xs italic text-slate-500">
                  A hypothesis about possible commercial consequences. It is not a price forecast.
                </p>
              )}
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Articles and provenance</h4>
            <ul className="space-y-3">
              {articles.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-100 p-3">
                  <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1 text-sm font-medium text-slate-900 hover:underline">
                    {a.title}
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  </a>
                  <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                    <div><dt className="inline text-slate-500">Publisher: </dt><dd className="inline">{a.publisher}</dd></div>
                    <div><dt className="inline text-slate-500">Published: </dt><dd className="inline">{a.publishedVerified ? formatMYT(a.publishedAt) : '—'}</dd></div>
                    <div><dt className="inline text-slate-500">First seen: </dt><dd className="inline">{formatMYT(a.firstSeenAt)}</dd></div>
                    <div><dt className="inline text-slate-500">Last seen: </dt><dd className="inline">{formatMYT(a.lastSeenAt)}</dd></div>
                  </dl>
                  <div className="mt-1"><TimestampFlag article={a} /></div>
                </li>
              ))}
            </ul>
          </div>

          {links.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Linked securities</h4>
              <ul className="flex flex-wrap gap-2 text-xs">
                {links.map((l) => {
                  const s = getSecurity(l.securityId);
                  return s ? (
                    <li key={`${l.securityId}-${l.type}`}>
                      <Link to={`/stock/${s.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50">
                        <span className="font-mono">{s.symbol}</span>
                        <span className="text-slate-500">{s.exchangeMic}</span>
                        <RelevanceBadge type={l.type} />
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
