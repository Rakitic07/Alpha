/**
 * Timezone helpers for Indian market logic.
 *
 * The app's data is anchored to the IST trading calendar but the server (Vercel)
 * runs in UTC. Mixing `new Date()` getters with IST semantics is the most common
 * source of off-by-one date / off-by-half-year bugs in this codebase. Always
 * route IST date / hour decisions through the helpers below.
 *
 * Design notes:
 * - We avoid the `new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))`
 *   anti-pattern: it round-trips through a locale-dependent string and is fragile
 *   across engines/locales.
 * - `Intl.DateTimeFormat` with a fixed `en-CA` (or `en-GB`) locale is stable and
 *   yields the trading-day calendar we need.
 */
const IST_TZ = 'Asia/Kolkata';

const IST_YMD_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const IST_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const IST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Today (or `now`) as YYYY-MM-DD in IST. Stable across server TZs. */
export function todayISTYmd(now: Date = new Date()): string {
  return IST_YMD_FORMATTER.format(now);
}

/** Calendar parts (year/month/day, 1-indexed month) for the IST date of `now`. */
export function istDateParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = todayISTYmd(now).split('-').map(Number);
  return { year: y, month: m, day: d };
}

/** Wall-clock hour/minute/second in IST. */
export function istTimeParts(now: Date = new Date()): {
  hour: number;
  minute: number;
  second: number;
} {
  const [h, m, s] = IST_TIME_FORMATTER.format(now).split(':').map(Number);
  return { hour: h, minute: m, second: s };
}

/** Day of week (0 = Sunday … 6 = Saturday) in IST. */
export function istDayOfWeek(now: Date = new Date()): number {
  // Use formatToParts to get the weekday short name, then map.
  const parts = IST_PARTS_FORMATTER.formatToParts(now);
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  switch (wd) {
    case 'Sun':
      return 0;
    case 'Mon':
      return 1;
    case 'Tue':
      return 2;
    case 'Wed':
      return 3;
    case 'Thu':
      return 4;
    case 'Fri':
      return 5;
    case 'Sat':
      return 6;
    default:
      return 0;
  }
}

/**
 * UTC-midnight `Date` matching the IST calendar date `ymd`. This is the
 * "naive timestamp = UTC midnight of trading label" convention used by
 * `StockHistory`, `IndexHistory`, `IntradayPnL`, etc.
 */
export function utcMidnightOfISTDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Today's IST trading day as a UTC-midnight Date (DB convention). */
export function todayUTCMidnightForISTDay(now: Date = new Date()): Date {
  return utcMidnightOfISTDate(todayISTYmd(now));
}
