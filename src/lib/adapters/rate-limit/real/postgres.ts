import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types.generated';
import { RateLimiterError, assertValidHit, type RateLimiter } from '../rate-limiter';

// Postgres RateLimiter (ADR-0005): calls ratelimit.hit(), which only service_role may execute.
// Excluded from unit coverage; verified by tests/contracts/rate-limit/rate-limiter.postgres.test.ts.

export type PostgresRateLimiterOptions = {
  /** Service-role client. Server-only. */
  serviceClient: SupabaseClient<Database>;
};

export function createPostgresRateLimiter({
  serviceClient,
}: PostgresRateLimiterOptions): RateLimiter {
  return {
    async hit(key, rule) {
      assertValidHit(key, rule);
      const { data, error } = await serviceClient.schema('ratelimit').rpc('hit', {
        p_key: key,
        p_limit: rule.limit,
        p_window_seconds: rule.windowSeconds,
      });
      // Never pass the error message on; the caller decides how to fail (closed).
      const row = data?.[0];
      if (error || !row) throw new RateLimiterError('unavailable');
      return row.allowed
        ? { allowed: true }
        : { allowed: false, retryAfterSeconds: row.retry_after_seconds };
    },
  };
}
