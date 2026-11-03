import { SourceStatusBadge, FreshnessBadge } from '../components/Badges';
import { useStore } from '../lib/store';
import { APP_TZ, isScheduledSlot, nextCollectionRun, formatMYT, formatMYTTime } from '../lib/time';
import { useNow } from '../lib/useNow';

export function Settings() {
  const now = useNow();
  const { sources, runs } = useStore();

  // Count the scheduled slots in one MYT day, so the number shown is derived from the rule, not typed in.
  let active = 0;
  let quiet = 0;
  for (let m = 0; m < 1440; m++) {
    if (!isScheduledSlot(m)) continue;
    if (m >= 540 && m <= 1010) active++;
    else quiet++;
  }
  const next = nextCollectionRun(now);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Owner preferences and system health. Times are shown in {APP_TZ}.</p>
      </div>

      <section aria-labelledby="sched-h" className="space-y-3">
        <h2 id="sched-h" className="text-base font-semibold">Collection schedule</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">MYT window</th>
                <th className="px-4 py-2 font-medium">Cadence</th>
                <th className="px-4 py-2 font-medium">Cycles / day</th>
                <th className="px-4 py-2 font-medium">UTC cron</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="px-4 py-2">09:00–16:50</td><td className="px-4 py-2">Every 10 min</td><td className="px-4 py-2 tabular-nums">{active}</td><td className="px-4 py-2 font-mono text-xs">*/10 1-8 * * *</td></tr>
              <tr><td className="px-4 py-2">17:00–08:30</td><td className="px-4 py-2">Every 30 min</td><td className="px-4 py-2 tabular-nums">{quiet}</td><td className="px-4 py-2 font-mono text-xs">0,30 0,9-23 * * *</td></tr>
              <tr className="bg-slate-50 font-medium"><td className="px-4 py-2" colSpan={2}>Total (every day)</td><td className="px-4 py-2 tabular-nums">{active + quiet}</td><td className="px-4 py-2 text-xs font-normal">≈ {(active + quiet) * 30} cycles / 30 days</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-600">
          Next scheduled run: <span className="font-medium text-slate-900">{formatMYT(next.toISOString())}</span> ({formatMYTTime(next)}). Cron is UTC; the window is defined in MYT.
        </p>
      </section>

      <section aria-labelledby="src-h" className="space-y-3">
        <h2 id="src-h" className="text-base font-semibold">Sources and quotas</h2>
        {sources.length === 0 && <p className="text-sm text-slate-500">No sources configured yet. The collector registers them when it first runs.</p>}
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white empty:hidden">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <div className="font-medium">{s.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{s.type}</span></div>
                <div className="mt-1 text-xs text-slate-500">Last success <FreshnessBadge iso={s.lastSuccessAt} now={now} /></div>
                {s.lastError && <div className="mt-1 text-xs text-amber-700">{s.lastError}</div>}
              </div>
              <div className="flex items-center gap-4">
                {s.quotaCap !== undefined && (
                  <div className="w-40">
                    <div className="flex justify-between text-xs text-slate-500"><span>Quota</span><span className="tabular-nums">{s.quotaUsed}/{s.quotaCap}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className={`h-1.5 rounded-full ${(s.quotaUsed ?? 0) >= s.quotaCap ? 'bg-red-500' : 'bg-brand'}`} style={{ width: `${Math.min(100, ((s.quotaUsed ?? 0) / s.quotaCap) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <SourceStatusBadge status={s.status} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="runs-h" className="space-y-3">
        <h2 id="runs-h" className="text-base font-semibold">Recent collector runs</h2>
        {runs.length === 0 && <p className="text-sm text-slate-500">No runs recorded yet.</p>}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Started (MYT)</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium">New / dupes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{formatMYT(r.startedAt)}</td>
                  <td className="px-4 py-2">{sources.find((s) => s.id === r.sourceId)?.name ?? r.sourceId}</td>
                  <td className="px-4 py-2 capitalize">{r.status} · {r.durationSec}s</td>
                  <td className="px-4 py-2 tabular-nums">{r.newArticles} / {r.duplicatesRemoved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="ret-h" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 id="ret-h" className="text-base font-semibold">Retention and limits</h2>
        <p className="text-slate-600">Retention for raw records and job logs is an open decision in the brief (§11). It is not configured in this build.</p>
        <p className="text-slate-600">Target watchlist size: 15–30 securities. Monthly spend target: under US$10, with free tiers preferred.</p>
      </section>
    </div>
  );
}
