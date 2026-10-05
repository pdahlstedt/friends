import type { RateLimiter, RateLimitResult } from '@/lib/adapters/rate-limit/rate-limiter';
import { normalizeEmail, rateLimitKey } from './keys';

// Declarative rate-limit rules (ADR-0005). Modules define policies as code-reviewed constants;
// this helper applies one policy to every dimension it names.

export type RateLimitDimension = 'ip' | 'email';

export type RateLimitPolicy = {
  /** Lower-case name, e.g. "login". Part of the key. */
  action: string;
  /** Each dimension is limited separately, with the same rule. */
  dimensions: readonly RateLimitDimension[];
  limit: number;
  windowSeconds: number;
};

export type RateLimitDeps = {
  limiter: RateLimiter;
  /** RATE_LIMIT_KEY_SECRET. */
  secret: string;
};

/**
 * Counts the request against every dimension of the policy (all of them, even when one already
 * denies) and denies if any is over its limit, with the longest retry. Limiter errors are passed
 * on: the caller decides how to fail.
 */
export async function checkRateLimit(
  { limiter, secret }: RateLimitDeps,
  policy: RateLimitPolicy,
  values: Partial<Record<RateLimitDimension, string>>,
): Promise<RateLimitResult> {
  const keys = policy.dimensions.map((dimension) => {
    const raw = values[dimension];
    if (raw === undefined) throw new Error(`Missing rate-limit value for dimension: ${dimension}`);
    const value = dimension === 'email' ? normalizeEmail(raw) : raw;
    return rateLimitKey(secret, policy.action, dimension, value);
  });

  const rule = { limit: policy.limit, windowSeconds: policy.windowSeconds };
  const results = await Promise.all(keys.map((key) => limiter.hit(key, rule)));

  let retryAfterSeconds = 0;
  for (const result of results) {
    if (!result.allowed) retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
  }
  return retryAfterSeconds > 0 ? { allowed: false, retryAfterSeconds } : { allowed: true };
}
