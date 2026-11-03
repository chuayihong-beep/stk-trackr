// All stored timestamps are UTC. Everything shown to the owner renders in MYT (UTC+8).
export const APP_TZ = 'Asia/Kuala_Lumpur';

const mytDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const mytTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatMYT(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  return `${mytDateTime.format(d)} MYT`;
}

export function formatMYTTime(iso: string | Date): string {
  return `${mytTime.format(typeof iso === 'string' ? new Date(iso) : iso)} MYT`;
}

/** "12 min ago", "3 h ago", "2 d ago" — collection freshness, relative to `now`. */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never';
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 0) return 'in the future';
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Minute-of-day (MYT) for a given instant. */
export function mytMinuteOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (h % 24) * 60 + m;
}

/**
 * Collection cadence from brief section 4 (MYT):
 *   09:00–16:50 MYT → every 10 minutes (48 cycles)
 *   17:00–08:30 MYT → every 30 minutes (32 cycles)
 * Equivalent UTC cron: "*\/10 1-8 * * *" and "0,30 0,9-23 * * *".
 */
export function cadenceMinutesAt(minuteOfDayMyt: number): number {
  return minuteOfDayMyt >= 540 && minuteOfDayMyt <= 1010 ? 10 : 30;
}

export function isScheduledSlot(minuteOfDayMyt: number): boolean {
  const cadence = cadenceMinutesAt(minuteOfDayMyt);
  const inActiveWindow = minuteOfDayMyt >= 540 && minuteOfDayMyt <= 1010;
  const inQuietWindow = minuteOfDayMyt >= 1020 || minuteOfDayMyt <= 510;
  if (!inActiveWindow && !inQuietWindow) return false;
  return minuteOfDayMyt % cadence === 0;
}

/** Next scheduled collection after `now`, computed on the MYT wall clock. */
export function nextCollectionRun(now: Date = new Date()): Date {
  // Step minute by minute; the schedule repeats daily so at most 1440 steps are needed.
  const probe = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 60_000);
  for (let i = 0; i < 1440; i++) {
    if (isScheduledSlot(mytMinuteOfDay(probe))) return probe;
    probe.setTime(probe.getTime() + 60_000);
  }
  return probe;
}

/** Freshness bucket used for badges: fresh (<= 2 cadences), stale, or unknown. */
export function freshnessLevel(iso: string | null | undefined, now: Date = new Date()): 'fresh' | 'stale' | 'unknown' {
  if (!iso) return 'unknown';
  const mins = (now.getTime() - new Date(iso).getTime()) / 60_000;
  const cadence = cadenceMinutesAt(mytMinuteOfDay(now));
  return mins <= cadence * 2 ? 'fresh' : 'stale';
}
