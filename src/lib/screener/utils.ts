/**
 * Shared utilities for the momentum screener pipeline.
 */

/** Lightweight concurrency limiter (no external dependency).
 *  staggerMs: delay between each worker's initial start — prevents simultaneous burst
 *  that triggers Cloudflare WAF (Error 1015) even when total req/s is within API limits.
 */
export async function withConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
  staggerMs = 0,
): Promise<{ successes: number; errors: string[] }> {
  const errors: string[] = [];
  let successes = 0;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
        successes++;
      } catch (err) {
        errors.push(`${items[i]}: ${(err as Error).message}`);
      }
    }
  }

  const count = Math.min(limit, items.length);
  const workers = Array.from({ length: count }, (_, i) =>
    staggerMs > 0
      ? new Promise<void>(r => setTimeout(r, i * staggerMs)).then(() => worker())
      : worker()
  );
  await Promise.all(workers);
  return { successes, errors };
}

/** Retry with exponential backoff. Rate-limit responses (HTTP 429/1015) use a long backoff (30–45 s). */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      if (attempt < maxRetries) {
        const isRateLimit = /429|1015|rate.?limit|too many requests/i.test(lastErr.message);
        const delay = isRateLimit
          ? 30_000 + Math.random() * 15_000                              // 30–45 s with jitter
          : baseDelayMs * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5); // exponential + jitter
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
