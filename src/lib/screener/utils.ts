/**
 * Shared utilities for the momentum screener pipeline.
 */

/** Lightweight concurrency limiter (no external dependency) */
export async function withConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
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

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return { successes, errors };
}

/** Retry with exponential backoff */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
