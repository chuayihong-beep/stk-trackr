import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { WATCHLIST_DEFAULT } from '../data/seed';

const KEY = 'si.watchlist.v1';

// Per-browser convenience only. Brief: watchlist persists server-side (D1) in Stage 2.
function load(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return WATCHLIST_DEFAULT;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : WATCHLIST_DEFAULT;
  } catch {
    return WATCHLIST_DEFAULT;
  }
}

function save(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable (private mode, blocked): keep working in memory */
  }
}

interface WatchlistValue {
  ids: string[];
  has: (id: string) => boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
}

const Ctx = createContext<WatchlistValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(load);

  useEffect(() => save(ids), [ids]);

  const add = useCallback((id: string) => setIds((cur) => (cur.includes(id) ? cur : [...cur, id])), []);
  const remove = useCallback((id: string) => setIds((cur) => cur.filter((x) => x !== id)), []);
  const value = useMemo<WatchlistValue>(
    () => ({ ids, has: (id) => ids.includes(id), add, remove }),
    [ids, add, remove],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWatchlist(): WatchlistValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWatchlist must be used inside WatchlistProvider');
  return v;
}
