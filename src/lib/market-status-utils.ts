import { istDayOfWeek, istTimeParts } from '@/lib/tz';

export const isMarketOpen = (): boolean => {
  const now = new Date();

  // Use Indian Standard Time (IST). Routed through `tz.ts` so the result is
  // correct regardless of the host's local timezone.
  const day = istDayOfWeek(now);
  const { hour, minute } = istTimeParts(now);
  const totalMinutes = hour * 60 + minute;

  // NSE market hours (sync fallback; authoritative status from Upstox Market Timings API)
  const startMinutes = 9 * 60 + 15;  // 9:15 AM
  const endMinutes = 15 * 60 + 30;   // 3:30 PM

  // Check if it's a weekday (Monday=1 to Friday=5)
  if (day >= 1 && day <= 5) {
    if (totalMinutes >= startMinutes && totalMinutes < endMinutes) {
      // Within trading hours on a weekday - check if it's a holiday
      // Note: We check holidays asynchronously, so this is a best-effort check
      // The actual holiday check happens in the background
      return true; // Assume open, holiday check will update UI asynchronously
    }
  }

  return false;
};
