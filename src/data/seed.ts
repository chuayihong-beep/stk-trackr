// SAMPLE DATA. All companies are fictional. Quotes, articles and relationships are illustrative
// and exist only so the UI can be exercised before the Stage 3–5 pipelines are live.
import type {
  Article, CollectorRun, EventItem, NewsSource, Quote, Relationship, Security, SecurityEvent,
} from '../lib/types';

const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

export const securities: Security[] = [
  { id: 'sec-khe-nyse', company: 'Kestrel Heavy Equipment Co', symbol: 'KHE', exchangeMic: 'XNYS', exchangeName: 'NYSE', currency: 'USD', country: 'US', sector: 'Industrial machinery', isin: 'US0000000001' },
  { id: 'sec-khe-bursa', company: 'Kestrel Heavy Equipment Bhd', symbol: 'KHE', exchangeMic: 'XKLS', exchangeName: 'Bursa Malaysia', currency: 'MYR', country: 'MY', sector: 'Industrial machinery' },
  { id: 'sec-arm-tsx', company: 'Aurum Ridge Mining Ltd', symbol: 'ARM', exchangeMic: 'XTSE', exchangeName: 'Toronto Stock Exchange', currency: 'CAD', country: 'CA', sector: 'Mining' },
  { id: 'sec-hcc-asx', company: 'Halden Copper Corp', symbol: 'HCC', exchangeMic: 'XASX', exchangeName: 'ASX', currency: 'AUD', country: 'AU', sector: 'Mining' },
  { id: 'sec-mli-xetr', company: 'Meridian Lithium AG', symbol: 'MLI', exchangeMic: 'XETR', exchangeName: 'Xetra', currency: 'EUR', country: 'DE', sector: 'Battery materials' },
  { id: 'sec-vrn-tse', company: 'Varno Semiconductor KK', symbol: 'VRN', exchangeMic: 'XTKS', exchangeName: 'Tokyo Stock Exchange', currency: 'JPY', country: 'JP', sector: 'Semiconductors' },
];

export const quotes: Quote[] = [
  { securityId: 'sec-khe-nyse', value: 84.2, currency: 'USD', marketAt: ago(18), ingestedAt: ago(12), provider: 'Sample provider A', delayed: true },
  { securityId: 'sec-arm-tsx', value: 11.6, currency: 'CAD', marketAt: ago(60 * 26), ingestedAt: ago(60 * 25), provider: 'Sample provider B (EOD)', delayed: true },
  { securityId: 'sec-hcc-asx', value: 4.37, currency: 'AUD', marketAt: ago(60 * 26), ingestedAt: ago(60 * 25), provider: 'Sample provider B (EOD)', delayed: true },
  // No quote for Bursa and Varno: unsupported by the provider in this sample → "Price unavailable".
];

export const sources: NewsSource[] = [
  { id: 'src-gnews', name: 'Google News RSS', type: 'RSS', status: 'ok', lastSuccessAt: ago(9) },
  { id: 'src-publisher', name: 'Publisher RSS (3 feeds)', type: 'RSS', status: 'degraded', lastSuccessAt: ago(70), lastError: 'HTTP 503 from one feed; retrying with backoff' },
  { id: 'src-gdelt', name: 'GDELT DOC API', type: 'API', status: 'ok', lastSuccessAt: ago(22), quotaUsed: 140, quotaCap: 1000 },
  { id: 'src-prices', name: 'Delayed price adapter', type: 'API', status: 'failing', lastSuccessAt: ago(60 * 26), lastError: 'Daily quota reached for provider A', quotaUsed: 500, quotaCap: 500 },
];

export const runs: CollectorRun[] = [
  { id: 'run-1', startedAt: ago(9), durationSec: 14, status: 'success', sourceId: 'src-gnews', newArticles: 12, duplicatesRemoved: 31 },
  { id: 'run-2', startedAt: ago(19), durationSec: 9, status: 'partial', sourceId: 'src-publisher', newArticles: 4, duplicatesRemoved: 7 },
  { id: 'run-3', startedAt: ago(22), durationSec: 6, status: 'success', sourceId: 'src-gdelt', newArticles: 8, duplicatesRemoved: 3 },
  { id: 'run-4', startedAt: ago(60 * 26), durationSec: 2, status: 'failed', sourceId: 'src-prices', newArticles: 0, duplicatesRemoved: 0 },
];

export const articles: Article[] = [
  { id: 'a1', url: 'https://example-news.test/mining/halden-discovery', title: 'Halden Copper reports major porphyry discovery in northern Chile', publisher: 'Sample Wire', publishedAt: ago(140), publishedVerified: true, firstSeenAt: ago(120), lastSeenAt: ago(9), sourceId: 'src-gnews' },
  { id: 'a2', url: 'https://example-finance.test/copper-rally', title: 'Copper miners rally as Chilean discovery sparks supply worries', publisher: 'Sample Markets', publishedAt: ago(150), publishedVerified: true, firstSeenAt: ago(100), lastSeenAt: ago(19), sourceId: 'src-publisher' },
  { id: 'a3', url: 'https://example-industry.test/mine-capex-outlook', title: 'Mining operators plan record equipment spending for 2027', publisher: 'Sample Industry Review', publishedAt: null, publishedVerified: false, timestampFlag: 'missing', firstSeenAt: ago(40), lastSeenAt: ago(22), sourceId: 'src-gdelt' },
  { id: 'a4', url: 'https://example-news.test/lithium/quota', title: 'Government announces lithium export quota for 2027', publisher: 'Sample Wire', publishedAt: ago(300), publishedVerified: true, firstSeenAt: ago(280), lastSeenAt: ago(60), sourceId: 'src-gnews' },
  { id: 'a5', url: 'https://example-news.test/lithium/quota-repost', title: 'Lithium export quota announced for next year', publisher: 'Sample Regional', publishedAt: ago(295), publishedVerified: true, firstSeenAt: ago(250), lastSeenAt: ago(60), sourceId: 'src-publisher' },
  { id: 'a6', url: 'https://example-news.test/chips/fab-delay', title: 'Varno delays second fab ramp amid tooling backlog', publisher: 'Sample Tech', publishedAt: ago(60 * 40), publishedVerified: true, firstSeenAt: ago(60 * 3), lastSeenAt: ago(60 * 3), sourceId: 'src-gdelt' },
  { id: 'a7', url: 'https://example-news.test/future', title: 'Kestrel announces dealer network expansion (date reported as 2029)', publisher: 'Sample Regional', publishedAt: '2029-01-01T00:00:00Z', publishedVerified: false, timestampFlag: 'future', firstSeenAt: ago(30), lastSeenAt: ago(30), sourceId: 'src-publisher' },
];

export const events: EventItem[] = [
  { id: 'ev-copper', title: 'Northern Chile porphyry discovery', summary: 'A new copper discovery reported by Halden Copper has drawn coverage from several outlets. Coverage clusters the original report and its follow-ups.', themes: ['copper', 'mining', 'Chile'], articleIds: ['a1', 'a2'], firstSeenAt: ago(120) },
  { id: 'ev-capex', title: 'Record mining equipment spending outlook', summary: 'Industry review reports planned capex increases at mining operators. Publisher date is missing, so the item is shown with its collection time only.', themes: ['mining capex', 'heavy machinery'], articleIds: ['a3'], firstSeenAt: ago(40) },
  { id: 'ev-lithium', title: '2027 lithium export quota', summary: 'A government export quota affects battery-materials supply. Two outlets carry the same announcement.', themes: ['lithium', 'export policy'], articleIds: ['a4', 'a5'], firstSeenAt: ago(280) },
  { id: 'ev-fab', title: 'Semiconductor fab ramp delay', summary: 'Reported tooling backlog for a second fab ramp.', themes: ['semiconductors', 'supply chain'], articleIds: ['a6'], firstSeenAt: ago(60 * 3) },
];

export const relationships: Relationship[] = [
  { id: 'rel-kheb-capex', securityId: 'sec-khe-nyse', kind: 'sector', label: 'Mining capex → demand for heavy mining equipment', verifiedAt: ago(60 * 24 * 10), evidence: [{ label: 'Industry capex outlook (Sample Industry Review)', url: 'https://example-industry.test/mine-capex-outlook' }] },
  { id: 'rel-kheb-capex-bursa', securityId: 'sec-khe-bursa', kind: 'sector', label: 'Mining capex → demand for heavy mining equipment', verifiedAt: ago(60 * 24 * 10), evidence: [{ label: 'Industry capex outlook (Sample Industry Review)', url: 'https://example-industry.test/mine-capex-outlook' }] },
  { id: 'rel-mli-quota', securityId: 'sec-mli-xetr', kind: 'regulatory', label: 'Lithium export policy affects battery-materials supply', verifiedAt: ago(60 * 24 * 4), evidence: [{ label: 'Export quota announcement', url: 'https://example-news.test/lithium/quota' }] },
  { id: 'rel-vrn-fab', securityId: 'sec-vrn-tse', kind: 'supplier', label: 'Tooling supplier backlog (fab ramp)', verifiedAt: ago(60 * 24 * 2), evidence: [{ label: 'Fab ramp delay report', url: 'https://example-news.test/chips/fab-delay' }] },
];

export const securityEvents: SecurityEvent[] = [
  { securityId: 'sec-hcc-asx', eventId: 'ev-copper', type: 'direct', confidence: 'high', why: 'Halden Copper is named as the discovery company in the reports.', evidence: [{ label: 'Original report', url: 'https://example-news.test/mining/halden-discovery' }] },
  { securityId: 'sec-khe-nyse', eventId: 'ev-capex', type: 'indirect', relationshipId: 'rel-kheb-capex', confidence: 'medium', why: 'If mining operators raise equipment budgets, demand for heavy machinery may rise. This is a hypothesis about commercial consequences, not a price forecast.', evidence: [{ label: 'Industry capex outlook', url: 'https://example-industry.test/mine-capex-outlook' }] },
  { securityId: 'sec-khe-bursa', eventId: 'ev-capex', type: 'indirect', relationshipId: 'rel-kheb-capex-bursa', confidence: 'medium', why: 'Separate company that shares only the ticker “KHE” with the NYSE listing. The sector link is shared, so verify the company relationship before relying on it.', evidence: [{ label: 'Industry capex outlook', url: 'https://example-industry.test/mine-capex-outlook' }] },
  { securityId: 'sec-mli-xetr', eventId: 'ev-lithium', type: 'indirect', relationshipId: 'rel-mli-quota', confidence: 'high', why: 'Export quotas can tighten supply of lithium-based materials, which is the input this company sells.', evidence: [{ label: 'Export quota announcement', url: 'https://example-news.test/lithium/quota' }] },
  { securityId: 'sec-vrn-tse', eventId: 'ev-fab', type: 'indirect', relationshipId: 'rel-vrn-fab', confidence: 'low', why: 'Reported tooling backlog may affect fab timing at a customer, which is an unverified link to Varno.', evidence: [{ label: 'Fab ramp delay report', url: 'https://example-news.test/chips/fab-delay' }] },
];

export const WATCHLIST_DEFAULT = ['sec-khe-nyse', 'sec-khe-bursa', 'sec-arm-tsx', 'sec-hcc-asx', 'sec-mli-xetr', 'sec-vrn-tse'];
