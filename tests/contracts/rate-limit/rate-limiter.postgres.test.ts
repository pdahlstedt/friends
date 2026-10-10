import { setTimeout as sleep } from 'node:timers/promises';
import { createPostgresRateLimiter } from '@/lib/adapters/rate-limit/real/postgres';
import { serviceClient } from '../../support/roles';
import { rateLimiterContract } from './rate-limiter.contract';

// Against local Supabase via ratelimit.hit(). Keys are random per test; leftover buckets
// expire and are removed by the hourly cleanup job (or `supabase db reset`).
rateLimiterContract('postgres', async () => ({
  limiter: createPostgresRateLimiter({ serviceClient: serviceClient() }),
  advance: (seconds) => sleep(seconds * 1000),
  cleanup: async () => {},
}));
