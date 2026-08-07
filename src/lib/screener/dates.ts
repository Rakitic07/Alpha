/**
 * Date utilities for the momentum screener pipeline.
 */

/**
 * Format a Date to YYYY-MM-DD string.
 *
 * Uses UTC calendar parts because the rest of the screener pipeline (and the
 * `todayIST()` helper below) deliberately constructs Date objects whose UTC
 * date matches the IST trading day. Using local-TZ getters here would shift
 * the date by one whenever the server runs in IST (e.g. local dev).
 */
export function toDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD string to Date (UTC) */
export function fromDateStr(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

/** Get today's date in IST as YYYY-MM-DD */
export function todayIST(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return toDateStr(ist);
}

/** Returns true if NSE market or Closing Auction Session (CAS) is active (9:15 AM – 4:00 PM IST) */
export function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 16 * 60; // 9:15 AM to 4:00 PM IST (includes Closing Auction Session)
}

/**
 * The effective trading day for pipeline scoring (sync, weekend-aware only).
 * During market hours, returns the previous weekday (last complete close).
 * After market close on a weekday, returns today.
 * On weekends, rolls back to the last weekday (Friday).
 *
 * NOTE: Does not check exchange holidays (async). Use resolveLastTradingDay()
 * in the pipeline for holiday-aware resolution.
 */
export function effectiveTradingDay(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  if (isMarketHours()) {
    return toDateStr(previousTradingDay(ist));
  }
  // On weekends, roll back to the last weekday
  if (isWeekend(ist)) {
    const d = new Date(ist);
    while (isWeekend(d)) {
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return toDateStr(d);
  }
  return toDateStr(ist);
}

/** Check if a date falls on a weekend */
export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Get the previous trading day (skips weekends, no holiday calendar) */
export function previousTradingDay(d: Date): Date {
  const prev = new Date(d);
  do {
    prev.setUTCDate(prev.getUTCDate() - 1);
  } while (isWeekend(prev));
  return prev;
}

/**
 * Async holiday-aware resolution of the last actual trading day.
 * Starts from the sync effectiveTradingDay() result, then checks
 * the Upstox holiday API and rolls back if necessary.
 * If the API fails (e.g. token expired), falls back to weekday-only
 * and relies on the pipeline's price freshness guard (count < 100)
 * to catch holidays.
 */
export async function resolveLastTradingDay(): Promise<string> {
  // Lazy import to avoid circular dependency
  const { isMarketHoliday } = await import('@/lib/upstox-client');

  let candidate = effectiveTradingDay();
  let attempts = 0;

  // Check up to 5 days back for holidays (covers long weekends)
  while (attempts < 5) {
    try {
      const isHoliday = await isMarketHoliday(candidate);
      if (!isHoliday) return candidate;
    } catch {
      // Upstox API unavailable — trust weekday-only result.
      // The pipeline's price freshness guard will catch holidays
      // (OHLC batch returns 0 new prices on holidays → count < 100 → abort).
      return candidate;
    }
    // Roll back one more day, skipping weekends
    const d = fromDateStr(candidate);
    d.setUTCDate(d.getUTCDate() - 1);
    while (isWeekend(d)) {
      d.setUTCDate(d.getUTCDate() - 1);
    }
    candidate = toDateStr(d);
    attempts++;
  }

  return candidate;
}

/** Get date N calendar days ago as YYYY-MM-DD (anchored to IST when no `from` is given) */
export function daysAgo(n: number, from?: string): string {
  const d = fromDateStr(from ?? todayIST());
  d.setUTCDate(d.getUTCDate() - n);
  return toDateStr(d);
}

/**
 * Format date for NSE bhavcopy URL: DDMMYY (2-digit year)
 * Example: 2026-03-30 → "300326"
 */
export function toBhavcopyDateFormat(dateStr: string): string {
  const d = fromDateStr(dateStr);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

/**
 * Format date for NSE mcap CSV filename: DDMMYYYY (4-digit year)
 * Example: 2026-03-30 → "30032026"
 */
export function toMcapDateFormat(dateStr: string): string {
  const d = fromDateStr(dateStr);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}${mm}${yyyy}`;
}
