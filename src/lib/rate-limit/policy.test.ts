import { describe, expect, it } from 'vitest';
import { createFakeRateLimiter } from '@/lib/adapters/rate-limit/fake';
import {
  RateLimiterError,
  type RateLimiter,
  type RateLimitResult,
} from '@/lib/adapters/rate-limit/rate-limiter';
import { rateLimitKey } from './keys';
import { checkRateLimit, type RateLimitPolicy } from './policy';

const secret = 'k'.repeat(32);
const login: RateLimitPolicy = {
  action: 'login',
  dimensions: ['ip', 'email'],
  limit: 2,
  windowSeconds: 900,
};

function spyLimiter(results: Record<string, RateLimitResult> = {}) {
  const calls: { key: string; limit: number; windowSeconds: number }[] = [];
  const limiter: RateLimiter = {
    hit: async (key, rule): Promise<RateLimitResult> => {
      calls.push({ key, ...rule });
      return results[key] ?? { allowed: true };
    },
  };
  return { limiter, calls };
}

describe('checkRateLimit', () => {
  it('hits one HMAC key per dimension with the policy rule', async () => {
    const { limiter, calls } = spyLimiter();
    const result = await checkRateLimit({ limiter, secret }, login, {
      ip: '203.0.113.7',
      email: 'A@Example.com',
    });

    expect(result).toEqual({ allowed: true });
    expect(calls).toEqual([
      { key: rateLimitKey(secret, 'login', 'ip', '203.0.113.7'), limit: 2, windowSeconds: 900 },
      // Emails are normalized before hashing.
      {
        key: rateLimitKey(secret, 'login', 'email', 'a@example.com'),
        limit: 2,
        windowSeconds: 900,
      },
    ]);
  });

  it('denies when any dimension denies, with the longest retry, and still counts every dimension', async () => {
    const ipKey = rateLimitKey(secret, 'login', 'ip', '203.0.113.7');
    const emailKey = rateLimitKey(secret, 'login', 'email', 'a@example.com');
    const { limiter, calls } = spyLimiter({
      [ipKey]: { allowed: false, retryAfterSeconds: 30 },
      [emailKey]: { allowed: false, retryAfterSeconds: 120 },
    });
    const result = await checkRateLimit({ limiter, secret }, login, {
      ip: '203.0.113.7',
      email: 'a@example.com',
    });
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 120 });
    expect(calls).toHaveLength(2);
  });

  it('denies when only one dimension is over its limit', async () => {
    const ipKey = rateLimitKey(secret, 'login', 'ip', '203.0.113.7');
    const { limiter } = spyLimiter({ [ipKey]: { allowed: false, retryAfterSeconds: 5 } });
    expect(
      await checkRateLimit({ limiter, secret }, login, {
        ip: '203.0.113.7',
        email: 'fresh@example.com',
      }),
    ).toEqual({ allowed: false, retryAfterSeconds: 5 });
  });

  it('[0001-AC9] limits per email across IPs and per IP across emails', async () => {
    const deps = { limiter: createFakeRateLimiter(), secret };
    const check = (ip: string, email: string) => checkRateLimit(deps, login, { ip, email });

    // Same email from rotating IPs: the email dimension stops it.
    expect((await check('198.51.100.1', 'victim@example.com')).allowed).toBe(true);
    expect((await check('198.51.100.2', 'victim@example.com')).allowed).toBe(true);
    expect((await check('198.51.100.3', 'victim@example.com')).allowed).toBe(false);

    // Same IP across many emails: the IP dimension stops it.
    expect((await check('192.0.2.9', 'one@example.com')).allowed).toBe(true);
    expect((await check('192.0.2.9', 'two@example.com')).allowed).toBe(true);
    expect((await check('192.0.2.9', 'three@example.com')).allowed).toBe(false);
  });

  it('[0002-AC7] limits per user ID across IPs, with the ID hashed as given', async () => {
    const deleteAccount: RateLimitPolicy = {
      action: 'delete_account',
      dimensions: ['ip', 'user'],
      limit: 2,
      windowSeconds: 900,
    };
    const userId = '0b7e1c2a-4f6d-4c1e-9a3b-2d5f8e7c6a10';
    const { limiter, calls } = spyLimiter();
    await checkRateLimit({ limiter, secret }, deleteAccount, { ip: '192.0.2.1', user: userId });
    expect(calls.map((c) => c.key)).toEqual([
      rateLimitKey(secret, 'delete_account', 'ip', '192.0.2.1'),
      rateLimitKey(secret, 'delete_account', 'user', userId),
    ]);

    // Same user from rotating IPs: the user dimension stops it.
    const deps = { limiter: createFakeRateLimiter(), secret };
    const check = (ip: string) => checkRateLimit(deps, deleteAccount, { ip, user: userId });
    expect((await check('198.51.100.1')).allowed).toBe(true);
    expect((await check('198.51.100.2')).allowed).toBe(true);
    expect((await check('198.51.100.3')).allowed).toBe(false);
  });

  it('only checks the dimensions the policy names', async () => {
    const { limiter, calls } = spyLimiter();
    await checkRateLimit(
      { limiter, secret },
      { ...login, dimensions: ['ip'] },
      { ip: '192.0.2.1' },
    );
    expect(calls).toHaveLength(1);
  });

  it('throws when a value for a policy dimension is missing', async () => {
    const { limiter } = spyLimiter();
    await expect(checkRateLimit({ limiter, secret }, login, { ip: '192.0.2.1' })).rejects.toThrow(
      'Missing rate-limit value for dimension: email',
    );
  });

  it('passes limiter errors on, so the caller decides how to fail', async () => {
    const limiter: RateLimiter = {
      hit: async () => {
        throw new RateLimiterError('unavailable');
      },
    };
    await expect(
      checkRateLimit({ limiter, secret }, login, { ip: '192.0.2.1', email: 'a@example.com' }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
