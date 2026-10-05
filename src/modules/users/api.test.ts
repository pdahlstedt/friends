import { describe, expect, it } from 'vitest';
import {
  createFakeAuthBackend,
  createFakeAuthProvider,
  issuedTokenFor,
} from '@/lib/adapters/auth/fake';
import { createFakeRateLimiter } from '@/lib/adapters/rate-limit/fake';
import { RateLimiterError, type RateLimiter } from '@/lib/adapters/rate-limit/rate-limiter';
import { createLogger } from '@/lib/log';
import { createUsersApi } from './api';

const PASSWORD = 'correct horse battery staple';
const MIN_MS = 800;

function setup(options: { limiter?: RateLimiter } = {}) {
  const backend = createFakeAuthBackend();
  const auth = createFakeAuthProvider(backend, {
    cookies: { getAll: () => [], setAll: () => {} },
    secureCookies: true,
  });
  let now = 0;
  const sleeps: number[] = [];
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
  };
  const logLines: string[] = [];
  const api = createUsersApi({
    auth,
    limiter: options.limiter ?? createFakeRateLimiter(),
    rateLimitSecret: 'r'.repeat(32),
    clock,
    logger: createLogger((_level, line) => logLines.push(line)),
  });
  return { api, backend, sleeps, logLines, advance: (ms: number) => (now += ms) };
}

const ctx = (clientIp = '203.0.113.7') => ({ clientIp });
let counter = 0;
const newEmail = () => `user-${++counter}@example.com`;

describe('signUp', () => {
  it('[0001-AC1] creates an unverified account, sends the email and says check_email', async () => {
    const { api, backend } = setup();
    expect(await api.signUp({ email: 'New@Example.com', password: PASSWORD }, ctx())).toEqual({
      kind: 'check_email',
    });
    expect(backend.users.get('new@example.com')?.confirmed).toBe(false);
    expect(issuedTokenFor(backend, 'new@example.com')).toBeDefined();
  });

  it('[0001-AC4] answers exactly the same for an existing email and leaves the account unchanged', async () => {
    const { api, backend } = setup();
    const email = newEmail();
    const first = await api.signUp({ email, password: PASSWORD }, ctx());
    const account = { ...backend.users.get(email)! };

    const second = await api.signUp(
      { email, password: 'a different password' },
      ctx('198.51.100.1'),
    );
    expect(second).toEqual(first);
    expect(backend.users.get(email)).toEqual(account);
  });

  it.each([
    [{ email: 'nope', password: PASSWORD }, { email: 'Enter a valid email address.' }],
    [{ email: 'a@example.com', password: 'short' }, { password: 'Use at least 12 characters.' }],
    [
      { email: 'a@example.com', password: 'x'.repeat(73) },
      { password: 'Use at most 72 characters.' },
    ],
    [
      {},
      {
        email: 'Enter a valid email address.',
        password: 'Use at least 12 characters.',
      },
    ],
  ])('[0001-AC3] returns field errors for %j and creates nothing', async (input, fieldErrors) => {
    const { api, backend, sleeps } = setup();
    expect(await api.signUp(input, ctx())).toEqual({ kind: 'invalid', fieldErrors });
    expect(backend.users.size).toBe(0);
    expect(backend.sent.size).toBe(0);
    expect(sleeps).toEqual([]); // validation errors reveal nothing about accounts: no padding
  });

  it.each([null, 'a string', 42])('treats non-object input %j as invalid', async (input) => {
    const { api } = setup();
    expect(await api.signUp(input, ctx())).toEqual({ kind: 'invalid', fieldErrors: {} });
  });

  it('[0001-AC14] rejects a client-supplied userId and creates nothing', async () => {
    const { api, backend } = setup();
    const input = { email: newEmail(), password: PASSWORD, userId: crypto.randomUUID() };
    expect(await api.signUp(input, ctx())).toEqual({ kind: 'invalid', fieldErrors: {} });
    expect(backend.users.size).toBe(0);
  });

  it('[0001-AC9] allows 3 per email per hour across IPs, then rate-limits without calling Supabase', async () => {
    const { api, backend } = setup();
    const email = newEmail();
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      expect((await api.signUp({ email, password: PASSWORD }, ctx(ip))).kind).toBe('check_email');
    }
    backend.users.clear(); // a 4th call reaching Supabase would recreate the account
    expect(await api.signUp({ email, password: PASSWORD }, ctx('198.51.100.4'))).toEqual({
      kind: 'rate_limited',
    });
    expect(backend.users.size).toBe(0);
  });

  it('[0001-AC9] allows 3 per IP per hour across emails', async () => {
    const { api } = setup();
    for (let i = 0; i < 3; i++) await api.signUp({ email: newEmail(), password: PASSWORD }, ctx());
    expect(await api.signUp({ email: newEmail(), password: PASSWORD }, ctx())).toEqual({
      kind: 'rate_limited',
    });
  });

  it('[0001-AC9] gives an existing email the same rate-limited answer as a new one', async () => {
    const { api } = setup();
    const existing = newEmail();
    await api.signUp({ email: existing, password: PASSWORD }, ctx('198.51.100.9'));
    const ip = '192.0.2.50';
    for (let i = 0; i < 3; i++)
      await api.signUp({ email: newEmail(), password: PASSWORD }, ctx(ip));
    expect(await api.signUp({ email: existing, password: PASSWORD }, ctx(ip))).toEqual(
      await api.signUp({ email: newEmail(), password: PASSWORD }, ctx(ip)),
    );
  });

  it('maps a Supabase rate limit to rate_limited', async () => {
    const { api, backend } = setup();
    backend.failures.set('signUp', 'rate_limited');
    expect(await api.signUp({ email: newEmail(), password: PASSWORD }, ctx())).toEqual({
      kind: 'rate_limited',
    });
  });

  it('[0001-AC4] pads every post-validation outcome to the minimum duration', async () => {
    const { api, backend, sleeps } = setup();
    const email = newEmail();
    await api.signUp({ email, password: PASSWORD }, ctx('198.51.100.1')); // new
    await api.signUp({ email, password: PASSWORD }, ctx('198.51.100.2')); // existing
    backend.failures.set('signUp', 'rate_limited');
    await api.signUp({ email: newEmail(), password: PASSWORD }, ctx('198.51.100.3'));
    expect(sleeps).toEqual([MIN_MS, MIN_MS, MIN_MS]);
  });

  it('fails closed when the rate limiter is unavailable: throws and never calls Supabase', async () => {
    const limiter: RateLimiter = {
      hit: async () => {
        throw new RateLimiterError('unavailable');
      },
    };
    const { api, backend, sleeps } = setup({ limiter });
    await expect(
      api.signUp({ email: newEmail(), password: PASSWORD }, ctx()),
    ).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(backend.users.size).toBe(0);
    expect(sleeps).toEqual([MIN_MS]);
  });

  it('passes an auth outage on as an error, still padded', async () => {
    const { api, backend, sleeps } = setup();
    backend.failures.set('signUp', 'unavailable');
    await expect(
      api.signUp({ email: newEmail(), password: PASSWORD }, ctx()),
    ).rejects.toMatchObject({
      name: 'AuthProviderError',
    });
    expect(sleeps).toEqual([MIN_MS]);
  });

  it('[0001-AC20] logs the outcome but never the email or password', async () => {
    const { api, logLines } = setup();
    const email = newEmail();
    await api.signUp({ email, password: PASSWORD }, ctx());
    await api.signUp({ email: 'bad', password: PASSWORD }, ctx());
    expect(logLines.map((l) => JSON.parse(l))).toEqual([
      expect.objectContaining({ event: 'users.sign_up', outcome: 'check_email' }),
      expect.objectContaining({ event: 'users.sign_up', outcome: 'invalid' }),
    ]);
    const all = logLines.join('\n');
    expect(all).not.toContain(email);
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain('203.0.113.7');
  });
});

describe('resendVerification', () => {
  it('sends a new token to an unconfirmed account', async () => {
    const { api, backend } = setup();
    const email = newEmail();
    await api.signUp({ email, password: PASSWORD }, ctx('198.51.100.1'));
    const first = issuedTokenFor(backend, email);
    expect(await api.resendVerification({ email }, ctx('198.51.100.2'))).toEqual({
      kind: 'sent_if_applicable',
    });
    expect(issuedTokenFor(backend, email)).not.toBe(first);
  });

  it('[0001-AC4] answers the same for unknown, unconfirmed and confirmed emails', async () => {
    const { api, backend } = setup();
    const unconfirmed = newEmail();
    await api.signUp({ email: unconfirmed, password: PASSWORD }, ctx('198.51.100.1'));
    const confirmed = newEmail();
    await api.signUp({ email: confirmed, password: PASSWORD }, ctx('198.51.100.2'));
    backend.users.get(confirmed)!.confirmed = true;

    const answers = await Promise.all(
      [newEmail(), unconfirmed, confirmed].map((email, i) =>
        api.resendVerification({ email }, ctx(`192.0.2.${i + 1}`)),
      ),
    );
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
  });

  it('returns field errors for a bad email and rejects unknown keys (AC14)', async () => {
    const { api } = setup();
    expect(await api.resendVerification({ email: 'x' }, ctx())).toEqual({
      kind: 'invalid',
      fieldErrors: { email: 'Enter a valid email address.' },
    });
    expect(await api.resendVerification({ email: newEmail(), userId: 'x' }, ctx())).toEqual({
      kind: 'invalid',
      fieldErrors: {},
    });
  });

  it('[0001-AC9] allows 3 per email per hour, then rate-limits; Supabase rate limits map too', async () => {
    const { api, backend } = setup();
    const email = newEmail();
    for (let i = 0; i < 3; i++) await api.resendVerification({ email }, ctx(`198.51.100.${i}`));
    expect(await api.resendVerification({ email }, ctx('198.51.100.9'))).toEqual({
      kind: 'rate_limited',
    });
    backend.failures.set('resend', 'rate_limited');
    expect(await api.resendVerification({ email: newEmail() }, ctx('192.0.2.1'))).toEqual({
      kind: 'rate_limited',
    });
  });

  it('pads to the minimum duration and logs without the email', async () => {
    const { api, sleeps, logLines } = setup();
    const email = newEmail();
    await api.resendVerification({ email }, ctx());
    expect(sleeps).toEqual([MIN_MS]);
    expect(JSON.parse(logLines[0]!)).toMatchObject({
      event: 'users.resend_verification',
      outcome: 'sent_if_applicable',
    });
    expect(logLines.join('\n')).not.toContain(email);
  });
});
