/**
 * Shared utilities for the momentum screener pipeline.
 */

/** Lightweight concurrency limiter (no external dependency).
 *  staggerMs: delay between each worker's initial start — prevents simultaneous burst
 *  that triggers Cloudflare WAF (Error 1015) even when total req/s is within API limits.
 *  throttleMs: delay after each request within a worker — caps sustained QPS to prevent
 *  Cloudflare from banning the shared Vercel IP mid-pipeline.
 */
export async function withConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
  staggerMs = 0,
  throttleMs = 0,
): Promise<{ successes: number; errors: string[]; rateLimited: T[] }> {
  const errors: string[] = [];
  const rateLimited: T[] = [];
  let successes = 0;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
        successes++;
      } catch (err) {
        const msg = (err as Error).message;
        if (/429|1015|rate.?limit|too many requests/i.test(msg)) {
          rateLimited.push(items[i]); // collect for cool-off retry, not a hard error
        } else {
          errors.push(`${items[i]}: ${msg}`);
        }
      }
      if (throttleMs > 0) await new Promise(r => setTimeout(r, throttleMs));
    }
  }

  const count = Math.min(limit, items.length);
  const workers = Array.from({ length: count }, (_, i) =>
    staggerMs > 0
      ? new Promise<void>(r => setTimeout(r, i * staggerMs)).then(() => worker())
      : worker()
  );
  await Promise.all(workers);
  return { successes, errors, rateLimited };
}

/** Retry with exponential backoff.
 *  Rate-limit errors (HTTP 429/1015) are NOT retried — the stock is skipped
 *  and the next daily run will pick it up once the IP ban expires.
 *  Retrying during an active Cloudflare ban just blocks the worker for 30–45 s
 *  without any chance of success.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      if (/429|1015|rate.?limit|too many requests/i.test(lastErr.message)) {
        throw lastErr; // Skip immediately — ban is IP-wide, retrying won't help
      }
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
