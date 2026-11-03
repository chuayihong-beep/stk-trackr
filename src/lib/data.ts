// Pure formatting helpers. Data access lives in store.tsx.
import type { Quote } from './types';

export function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

/** Older than one day is treated as stale for display. */
export function isQuoteStale(q: Quote, now: Date = new Date()): boolean {
  return now.getTime() - new Date(q.marketAt).getTime() > 24 * 60 * 60 * 1000;
}
