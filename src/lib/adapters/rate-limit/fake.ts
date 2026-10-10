import { assertValidHit, type RateLimiter } from './rate-limiter';

// In-memory RateLimiter for unit tests. Same fixed-window rules as ratelimit.hit() in Postgres,
// driven by an injectable clock so tests can move time.

export type FakeRateLimiterOptions = {
  /** Current time in milliseconds. */
  now?: () => number;
};

type Bucket = { count: number; expiresAtMs: number };

export function createFakeRateLimiter({
  now = Date.now,
}: FakeRateLimiterOptions = {}): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    async hit(key, rule) {
      assertValidHit(key, rule);
      const nowMs = now();
      const current = buckets.get(key);

      let bucket: Bucket;
      if (!current || current.expiresAtMs <= nowMs) {
        bucket = { count: 1, expiresAtMs: nowMs + rule.windowSeconds * 1000 };
      } else {
        // Capped at limit + 1, as in Postgres.
        bucket = {
          count: Math.min(current.count, rule.limit) + 1,
          expiresAtMs: current.expiresAtMs,
        };
      }
      buckets.set(key, bucket);

      if (bucket.count <= rule.limit) return { allowed: true };
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.expiresAtMs - nowMs) / 1000));
      return { allowed: false, retryAfterSeconds };
    },
  };
}
