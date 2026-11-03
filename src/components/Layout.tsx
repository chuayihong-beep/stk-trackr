import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Search, Star, Settings as SettingsIcon, FlaskConical } from 'lucide-react';
import { formatMYT } from '../lib/time';
import { useNow } from '../lib/useNow';

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/favourites', label: 'Favourites', icon: Star },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout() {
  const now = useNow();
  return (
    <div className="min-h-dvh">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
        <FlaskConical className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        Sample data: companies are fictional and quotes are illustrative. Live adapters arrive in Stages 3–5.
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">SI</span>
            <div>
              <div className="text-sm font-semibold leading-tight">Stock Intelligence</div>
              <div className="text-xs text-slate-500">Private watchlist · {formatMYT(now.toISOString())}</div>
            </div>
          </div>
          <nav aria-label="Primary" className="flex gap-1 overflow-x-auto">
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
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        Stored times are UTC and shown in Malaysia Time (MYT). Discovery and commercial impact are hypotheses to check, not forecasts or advice.
      </footer>
    </div>
  );
}
