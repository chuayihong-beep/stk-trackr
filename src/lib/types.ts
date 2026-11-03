// Mirrors the brief's data model (section 5). All timestamps are ISO-8601 UTC strings.

export type Currency = 'USD' | 'MYR' | 'CAD' | 'AUD' | 'EUR' | 'JPY';

export interface Security {
  id: string;
  company: string;
  symbol: string;
  exchangeMic: string; // ISO 10383 market identifier code
  exchangeName: string;
  currency: Currency;
  country: string;
  isin?: string;
  sector: string;
}

export interface Quote {
  securityId: string;
  value: number;
  currency: Currency;
  marketAt: string; // timestamp reported by the market/provider
  ingestedAt: string; // when this app stored the value
  provider: string;
  delayed: boolean; // true for delayed or end-of-day
}

export interface Article {
  id: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null; // publisher-stated; null when missing
  publishedVerified: boolean; // false when missing, invalid or future-dated
  timestampFlag?: 'missing' | 'future' | 'invalid';
  updatedAt?: string;
  firstSeenAt: string; // collector discovery time, never a publication date
  lastSeenAt: string;
  sourceId: string;
}

export interface EventItem {
  id: string;
  title: string;
  summary: string;
  themes: string[];
  articleIds: string[];
  firstSeenAt: string;
}

export interface Evidence {
  label: string;
  url: string;
}

export interface Relationship {
  id: string;
  securityId: string;
  kind: 'sector' | 'commodity' | 'supplier' | 'customer' | 'geography' | 'regulatory';
  label: string;
  evidence: Evidence[];
  verifiedAt: string;
}

export interface SecurityEvent {
  securityId: string;
  eventId: string;
  type: 'direct' | 'indirect';
  relationshipId?: string; // required for indirect links
  confidence: 'high' | 'medium' | 'low';
  why: string; // answers "Why is this relevant to this security?"
  evidence: Evidence[];
}

export type SourceStatus = 'ok' | 'degraded' | 'failing';

export interface NewsSource {
  id: string;
  name: string;
  type: 'RSS' | 'API';
  status: SourceStatus;
  lastSuccessAt: string | null;
  lastError?: string;
  quotaUsed?: number;
  quotaCap?: number;
}

export interface CollectorRun {
  id: string;
  startedAt: string;
  durationSec: number;
  status: 'success' | 'partial' | 'failed';
  sourceId: string;
  newArticles: number;
  duplicatesRemoved: number;
}
