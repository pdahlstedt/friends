// RateLimiter adapter interface (ADR-0005). Implementations: fake.ts (unit tests) and
// real/postgres.ts. Both must pass tests/contracts/rate-limit/rate-limiter.contract.ts.

export type RateLimitRule = {
  /** Requests allowed per window. Positive integer. */
  limit: number;
  /** Window length, starting at the first request. Positive integer. */
  windowSeconds: number;
};

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  /**
   * Counts one request against `key` (an opaque, already-hashed key — see lib/rate-limit) and
   * says whether it is within the rule. Fixed window: denied requests do not extend it.
   */
  hit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}

export type RateLimiterErrorCode = 'invalid_key' | 'invalid_rule' | 'unavailable';

/** Carries a code only; vendor messages never leave the adapter. */
export class RateLimiterError extends Error {
  constructor(readonly code: RateLimiterErrorCode) {
    super(`Rate limiter error: ${code}`);
    this.name = 'RateLimiterError';
  }
}

/** Shared input checks, so every implementation rejects exactly the same calls. */
export function assertValidHit(key: string, rule: RateLimitRule): void {
  if (key.length < 1 || key.length > 200) throw new RateLimiterError('invalid_key');
  const positiveInt = (n: number) => Number.isInteger(n) && n >= 1;
  if (!positiveInt(rule.limit) || !positiveInt(rule.windowSeconds)) {
    throw new RateLimiterError('invalid_rule');
  }
}
