// Read-model helpers. Today these read the sample dataset; Stage 3–5 replaces them with API calls
// to the Worker, keeping the same shapes so the pages do not change.
import { articles, events, quotes, relationships, securities, securityEvents, sources, runs } from '../data/seed';
import type { Article, EventItem, Quote, Relationship, Security, SecurityEvent } from './types';

export const getSecurity = (id: string): Security | undefined => securities.find((s) => s.id === id);
export const getQuote = (securityId: string): Quote | undefined => quotes.find((q) => q.securityId === securityId);
export const getEvent = (id: string): EventItem | undefined => events.find((e) => e.id === id);
export const getArticle = (id: string): Article | undefined => articles.find((a) => a.id === id);
export const getRelationship = (id?: string): Relationship | undefined => relationships.find((r) => r.id === id);
export const getSources = () => sources;
export const getRuns = () => runs;
export const getAllArticles = () => articles;
export const getAllEvents = () => events;

export interface EventLink {
  event: EventItem;
  link: SecurityEvent;
}

export function eventsFor(securityId: string): EventLink[] {
  return securityEvents
    .filter((l) => l.securityId === securityId)
    .map((link) => ({ link, event: getEvent(link.eventId)! }))
    .filter((x) => x.event)
    .sort((a, b) => b.event.firstSeenAt.localeCompare(a.event.firstSeenAt));
}

export function latestEvents(limit = 10): EventItem[] {
  return [...events].sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)).slice(0, limit);
}

export function linksForEvent(eventId: string): SecurityEvent[] {
  return securityEvents.filter((l) => l.eventId === eventId);
}

export function searchSecurities(query: string): Security[] {
  const q = query.trim().toLowerCase();
  if (!q) return securities;
  return securities.filter((s) =>
    [s.company, s.symbol, s.exchangeName, s.exchangeMic, s.country, s.sector]
      .some((field) => field.toLowerCase().includes(q)),
  );
}

export function searchEvents(query: string): EventItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return events.filter((e) =>
    [e.title, e.summary, ...e.themes].some((field) => field.toLowerCase().includes(q)),
  );
}

export function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

/** Staleness for a quote: older than one trading day is treated as stale for display. */
export function isQuoteStale(q: Quote, now: Date = new Date()): boolean {
  return now.getTime() - new Date(q.marketAt).getTime() > 24 * 60 * 60 * 1000;
}
