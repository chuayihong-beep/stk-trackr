import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Search, Star, Settings as SettingsIcon, LogOut, RefreshCw } from 'lucide-react';
import { formatMYT, relativeTime } from '../lib/time';
import { useNow } from '../lib/useNow';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { useState } from 'react';

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/favourites', label: 'Favourites', icon: Star },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout() {
  const now = useNow();
  const { signOut } = useAuth();
  const { status, error, loadedAt, reload } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">SI</span>
            <div>
              <div className="text-sm font-semibold leading-tight">Stock Intelligence</div>
              <div className="text-xs text-slate-500">{formatMYT(now.toISOString())}</div>
            </div>
          </div>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className={isActive ? '' : 'hidden sm:inline'}>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button type="button" onClick={() => void signOut()} title="Sign out" aria-label="Sign out"
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 px-4 pt-3 text-xs text-slate-500">
        {status === 'error' ? (
          <span className="text-red-700">Could not load data: {error}</span>
        ) : (
          <span>Data loaded {loadedAt ? relativeTime(loadedAt.toISOString(), now) : '…'}</span>
        )}
        <button type="button" onClick={() => void refresh()} disabled={refreshing}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-200 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden /> Reload
        </button>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-4">
        {status === 'loading' ? <p className="py-16 text-center text-sm text-slate-500">Loading your data…</p> : <Outlet />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        Stored times are UTC and shown in Malaysia Time (MYT). Indirect impacts are hypotheses to check, not forecasts or advice.
      </footer>
    </div>
  );
}
