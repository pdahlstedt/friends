import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  RateLimiterError,
  type RateLimiter,
  type RateLimitResult,
} from '@/lib/adapters/rate-limit/rate-limiter';

// RateLimiter contract (spec 0001, AC9 / ADR-0005): fixed window per key. Runs against the
// in-memory fake (controlled clock) and the Postgres implementation (real time; windows are
// kept to a few seconds so the suite stays fast).

export type RateLimiterHarness = {
  limiter: RateLimiter;
  /** Lets `seconds` of time pass: moves the fake clock, or waits for real. */
  advance(seconds: number): Promise<void>;
  cleanup(): Promise<void>;
};

const newKey = () => `contract-${randomUUID()}`;

async function hits(
  limiter: RateLimiter,
  key: string,
  n: number,
  limit: number,
  windowSeconds = 60,
) {
  const results: RateLimitResult[] = [];
  for (let i = 0; i < n; i++) results.push(await limiter.hit(key, { limit, windowSeconds }));
  return results;
}

export function rateLimiterContract(name: string, makeHarness: () => Promise<RateLimiterHarness>) {
  describe(`RateLimiter contract: ${name}`, () => {
    let h: RateLimiterHarness;

    beforeAll(async () => {
      h = await makeHarness();
    });

    afterAll(async () => {
      await h?.cleanup();
    });

    it('[0001-AC9] allows up to the limit, then denies with retryAfterSeconds', async () => {
      const results = await hits(h.limiter, newKey(), 5, 3, 60);
      expect(results.slice(0, 3)).toEqual([
        { allowed: true },
        { allowed: true },
        { allowed: true },
      ]);
      for (const denied of results.slice(3)) {
        expect(denied.allowed).toBe(false);
        if (denied.allowed) continue;
        expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(59);
        expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
      }
    });

    it('counts keys independently', async () => {
      const [a, b] = [newKey(), newKey()];
      await hits(h.limiter, a, 2, 1);
      expect(await h.limiter.hit(b, { limit: 1, windowSeconds: 60 })).toEqual({ allowed: true });
    });

    it('retryAfterSeconds counts down to the end of the window', async () => {
      const key = newKey();
      const rule = { limit: 1, windowSeconds: 3 };
      await h.limiter.hit(key, rule);
      expect(await h.limiter.hit(key, rule)).toEqual({ allowed: false, retryAfterSeconds: 3 });

      await h.advance(1.5);
      const later = await h.limiter.hit(key, rule);
      expect(later.allowed).toBe(false);
      if (!later.allowed) {
        expect(later.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(later.retryAfterSeconds).toBeLessThanOrEqual(2);
      }
    });

    it('starts a fresh window once the old one has passed, even after denials', async () => {
      const key = newKey();
      const rule = { limit: 2, windowSeconds: 1 };
      const first = await hits(h.limiter, key, 4, rule.limit, rule.windowSeconds);
      expect(first.map((r) => r.allowed)).toEqual([true, true, false, false]);

      // Fixed window: denied hits did not extend it.
      await h.advance(1.2);
      const second = await hits(h.limiter, key, 3, rule.limit, rule.windowSeconds);
      expect(second.map((r) => r.allowed)).toEqual([true, true, false]);
    });

    it('[0001-AC9] counts concurrent hits exactly', async () => {
      const key = newKey();
      const results = await Promise.all(
        Array.from({ length: 20 }, () => h.limiter.hit(key, { limit: 5, windowSeconds: 60 })),
      );
      expect(results.filter((r) => r.allowed)).toHaveLength(5);
    });

    it('keeps denying under a flood (no counter overflow or reset)', async () => {
      const key = newKey();
      const results = await hits(h.limiter, key, 30, 2);
      expect(results.filter((r) => r.allowed)).toHaveLength(2);
      expect(results.at(-1)?.allowed).toBe(false);
    });

    it.each([
      ['limit 0', { limit: 0, windowSeconds: 60 }],
      ['fractional limit', { limit: 1.5, windowSeconds: 60 }],
      ['window 0', { limit: 1, windowSeconds: 0 }],
      ['fractional window', { limit: 1, windowSeconds: 0.5 }],
    ])('rejects an invalid rule (%s) without counting', async (_name, rule) => {
      const key = newKey();
      await expect(h.limiter.hit(key, rule)).rejects.toMatchObject({
        name: 'RateLimiterError',
        code: 'invalid_rule',
      });
      expect(await h.limiter.hit(key, { limit: 1, windowSeconds: 60 })).toEqual({ allowed: true });
    });

    it.each([
      ['empty', ''],
      ['too long', 'k'.repeat(201)],
    ])('rejects an invalid key (%s)', async (_name, key) => {
      const error = await h.limiter.hit(key, { limit: 1, windowSeconds: 60 }).catch((e) => e);
      expect(error).toBeInstanceOf(RateLimiterError);
      expect(error.code).toBe('invalid_key');
    });
  });
}
