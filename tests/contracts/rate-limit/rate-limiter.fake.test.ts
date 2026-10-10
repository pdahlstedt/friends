import { createFakeRateLimiter } from '@/lib/adapters/rate-limit/fake';
import { rateLimiterContract } from './rate-limiter.contract';

rateLimiterContract('fake', async () => {
  let nowMs = Date.parse('2026-10-05T12:00:00.000Z');
  return {
    limiter: createFakeRateLimiter({ now: () => nowMs }),
    advance: async (seconds) => {
      nowMs += seconds * 1000;
    },
    cleanup: async () => {},
  };
});
