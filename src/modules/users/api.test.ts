import { describe, expect, it } from 'vitest';
import {
  FAKE_SESSION_COOKIE,
  createFakeAuthBackend,
  createFakeAuthProvider,
  issuedTokenFor,
} from '@/lib/adapters/auth/fake';
import { createFakeRateLimiter } from '@/lib/adapters/rate-limit/fake';
import { RateLimiterError, type RateLimiter } from '@/lib/adapters/rate-limit/rate-limiter';
import { createLogger } from '@/lib/log';
import type { UserId } from '@/lib/types/ids';
import { ProfilesError, type ProfilesApi } from '@/modules/profiles';
import { rateLimitKey } from '@/lib/rate-limit/keys';
import { createUsersApi } from './api';
import { createMemoryAuthLeftovers, createMemoryUserAccountStore } from './store/memory';

const PASSWORD = 'correct horse battery staple';
const MIN_MS = 800;

/** A minimal browser cookie store, so sessions persist across calls in one test. */
function cookieJar() {
  const cookies = new Map<string, string>();
  return {
    cookies,
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (toSet: { name: string; value: string; options: { maxAge?: number } }[]) => {
      for (const c of toSet) {
        if (c.options.maxAge === 0) cookies.delete(c.name);
        else cookies.set(c.name, c.value);
      }
    },
  };
}

/** Records ensureProfile calls; can be made to fail. */
function recordingProfiles() {
  const ensured: UserId[] = [];
  let failure: ProfilesError | undefined;
  const api: ProfilesApi = {
    ensureProfile: async (userId) => {
      if (failure) throw failure;
      ensured.push(userId);
    },
    getOwnProfile: async () => null,
  };
  return { api, ensured, fail: (e: ProfilesError) => (failure = e) };
}

function setup(options: { limiter?: RateLimiter } = {}) {
  const backend = createFakeAuthBackend();
  const jar = cookieJar();
  const auth = createFakeAuthProvider(backend, { cookies: jar, secureCookies: true });
  const profiles = recordingProfiles();
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
  const auditLog = createMemoryAuthLeftovers();
  const api = createUsersApi({
    auth,
    profiles: profiles.api,
    accounts: createMemoryUserAccountStore(auditLog),
    limiter: options.limiter ?? createFakeRateLimiter(),
    rateLimitSecret: 'r'.repeat(32),
    clock,
    logger: createLogger((_level, line) => logLines.push(line)),
  });
  return { api, backend, jar, profiles, sleeps, logLines, auditLog };
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

/** Signs up `email` and returns its verification token (fake inbox). */
async function signedUp(
  api: ReturnType<typeof setup>['api'],
  backend: ReturnType<typeof setup>['backend'],
  email: string,
) {
  await api.signUp({ email, password: PASSWORD }, ctx('198.51.100.200'));
  return issuedTokenFor(backend, email)!;
}

describe('confirmEmail', () => {
  it('[0001-AC2] confirms, signs in and ensures the profile (AC11)', async () => {
    const { api, backend, profiles, logLines } = setup();
    const email = newEmail();
    const token = await signedUp(api, backend, email);

    expect(await api.confirmEmail({ tokenHash: token })).toEqual({ kind: 'confirmed' });
    const user = await api.getCurrentUser();
    expect(user?.id).toBe(backend.users.get(email)!.id);
    expect(profiles.ensured).toEqual([user!.id]);
    expect(JSON.parse(logLines.at(-1)!)).toMatchObject({
      event: 'users.confirm_email',
      outcome: 'confirmed',
    });
    expect(logLines.join('\n')).not.toContain(token);
  });

  it('[0001-AC5] an unknown or reused token is invalid_link, with no session or profile', async () => {
    const { api, backend, profiles } = setup();
    const token = await signedUp(api, backend, newEmail());
    await api.confirmEmail({ tokenHash: token });
    await api.logOut();
    profiles.ensured.length = 0;

    for (const tokenHash of [token, 'pkce_0123456789abcdef']) {
      expect(await api.confirmEmail({ tokenHash })).toEqual({ kind: 'invalid_link' });
    }
    expect(await api.getCurrentUser()).toBeNull();
    expect(profiles.ensured).toEqual([]);
  });

  it.each([
    null,
    {},
    { tokenHash: '' },
    { tokenHash: 'has spaces' },
    { tokenHash: 'a/b' },
    { tokenHash: 'x'.repeat(201) },
    { tokenHash: 'abc', userId: 'x' },
  ])(
    '[0001-AC5] rejects malformed input %j as invalid_link without calling Supabase',
    async (input) => {
      const { api, backend } = setup();
      backend.failures.set('verify', 'unavailable'); // would throw if reached
      expect(await api.confirmEmail(input)).toEqual({ kind: 'invalid_link' });
    },
  );

  it('maps a Supabase rate limit to rate_limited', async () => {
    const { api, backend } = setup();
    backend.failures.set('verify', 'rate_limited');
    expect(await api.confirmEmail({ tokenHash: 'abc' })).toEqual({ kind: 'rate_limited' });
  });

  it('is not padded (a token reveals nothing about accounts)', async () => {
    const { api, sleeps } = setup();
    await api.confirmEmail({ tokenHash: 'abc' });
    expect(sleeps).toEqual([]);
  });

  it('passes a profile failure on (the next log-in ensures it again)', async () => {
    const { api, backend, profiles } = setup();
    const token = await signedUp(api, backend, newEmail());
    profiles.fail(new ProfilesError('unavailable'));
    await expect(api.confirmEmail({ tokenHash: token })).rejects.toBeInstanceOf(ProfilesError);
  });
});

describe('logIn', () => {
  async function confirmedUser() {
    const s = setup();
    const email = newEmail();
    const token = await signedUp(s.api, s.backend, email);
    await s.api.confirmEmail({ tokenHash: token });
    await s.api.logOut();
    s.profiles.ensured.length = 0;
    s.sleeps.length = 0;
    return { ...s, email, id: s.backend.users.get(email)!.id };
  }

  it('[0001-AC6] logs in a confirmed user and ensures the profile', async () => {
    const { api, email, id, profiles } = await confirmedUser();
    expect(await api.logIn({ email: email.toUpperCase(), password: PASSWORD }, ctx())).toEqual({
      kind: 'logged_in',
    });
    expect(await api.getCurrentUser()).toEqual({ id });
    expect(profiles.ensured).toEqual([id]);
  });

  it('[0001-AC7] gives the same answer, padded, for a wrong password and an unknown email', async () => {
    const { api, email, sleeps } = await confirmedUser();
    const wrong = await api.logIn({ email, password: 'wrong password!' }, ctx('192.0.2.1'));
    const unknown = await api.logIn({ email: newEmail(), password: PASSWORD }, ctx('192.0.2.2'));
    expect(wrong).toEqual({ kind: 'invalid_credentials' });
    expect(unknown).toEqual(wrong);
    expect(sleeps).toEqual([MIN_MS, MIN_MS]);
    expect(await api.getCurrentUser()).toBeNull();
  });

  it('[0001-AC8] tells an unconfirmed user to verify, without a session or profile', async () => {
    const { api, backend, profiles } = setup();
    const email = newEmail();
    await signedUp(api, backend, email);
    expect(await api.logIn({ email, password: PASSWORD }, ctx())).toEqual({
      kind: 'email_not_confirmed',
    });
    expect(await api.getCurrentUser()).toBeNull();
    expect(profiles.ensured).toEqual([]);
  });

  it('[0001-AC9] allows 5 attempts per email per 15 min, then rate-limits even the right password', async () => {
    const { api, email, profiles } = await confirmedUser();
    for (let i = 0; i < 5; i++) {
      await api.logIn({ email, password: 'wrong password!' }, ctx(`198.51.100.${i + 10}`));
    }
    expect(await api.logIn({ email, password: PASSWORD }, ctx('198.51.100.99'))).toEqual({
      kind: 'rate_limited',
    });
    expect(await api.getCurrentUser()).toBeNull();
    expect(profiles.ensured).toEqual([]);
  });

  it('[0001-AC9] allows 5 attempts per IP across emails', async () => {
    const { api } = setup();
    for (let i = 0; i < 5; i++) await api.logIn({ email: newEmail(), password: PASSWORD }, ctx());
    expect(await api.logIn({ email: newEmail(), password: PASSWORD }, ctx())).toEqual({
      kind: 'rate_limited',
    });
  });

  it('maps a Supabase rate limit to rate_limited', async () => {
    const { api, backend } = setup();
    backend.failures.set('signIn', 'rate_limited');
    expect(await api.logIn({ email: newEmail(), password: PASSWORD }, ctx())).toEqual({
      kind: 'rate_limited',
    });
  });

  it.each([
    [{ email: 'nope', password: 'x' }, { email: 'Enter a valid email address.' }],
    [{ email: 'a@example.com', password: '' }, { password: 'Enter your password.' }],
    [{ email: 'a@example.com', password: 'x'.repeat(1025) }, { password: 'Enter your password.' }],
  ])('returns field errors for %j, unpadded', async (input, fieldErrors) => {
    const { api, sleeps } = setup();
    expect(await api.logIn(input, ctx())).toEqual({ kind: 'invalid', fieldErrors });
    expect(sleeps).toEqual([]);
  });

  it('treats a short password as just wrong, not as a field error', async () => {
    const { api } = setup();
    expect(await api.logIn({ email: newEmail(), password: 'short' }, ctx())).toEqual({
      kind: 'invalid_credentials',
    });
  });

  it('[0001-AC14] rejects a client-supplied userId', async () => {
    const { api, email, id } = await confirmedUser();
    expect(await api.logIn({ email, password: PASSWORD, userId: id }, ctx())).toEqual({
      kind: 'invalid',
      fieldErrors: {},
    });
    expect(await api.getCurrentUser()).toBeNull();
  });

  it('[0001-AC20] logs outcomes without email or password', async () => {
    const { api, email, logLines } = await confirmedUser();
    logLines.length = 0;
    await api.logIn({ email, password: PASSWORD }, ctx());
    expect(JSON.parse(logLines[0]!)).toMatchObject({ event: 'users.log_in', outcome: 'logged_in' });
    expect(logLines.join('\n')).not.toContain(email);
    expect(logLines.join('\n')).not.toContain(PASSWORD);
  });
});

describe('logOut and getCurrentUser', () => {
  it('[0001-AC10] logOut ends the session and logs it', async () => {
    const { api, backend, jar, logLines } = setup();
    const token = await signedUp(api, backend, newEmail());
    await api.confirmEmail({ tokenHash: token });
    expect(await api.getCurrentUser()).not.toBeNull();

    await api.logOut();
    expect(await api.getCurrentUser()).toBeNull();
    expect(jar.cookies.size).toBe(0);
    expect(JSON.parse(logLines.at(-1)!)).toMatchObject({ event: 'users.log_out' });
  });

  it('getCurrentUser is null without a session', async () => {
    const { api } = setup();
    expect(await api.getCurrentUser()).toBeNull();
  });
});

describe('deleteAccount', () => {
  const SECRET = 'r'.repeat(32);

  /** A confirmed user, signed in on the setup's browser, with some audit history. */
  async function signedIn(t: ReturnType<typeof setup>, email = newEmail()) {
    await t.api.signUp({ email, password: PASSWORD }, ctx());
    await t.api.confirmEmail({ tokenHash: issuedTokenFor(t.backend, email)! });
    const user = (await t.api.getCurrentUser())!;
    t.auditLog.entries.push({ action: 'login', userId: user.id, email });
    return { email, id: user.id };
  }

  it('[0002-AC2] deletes the account with the right password, erases audit entries and ends the session', async () => {
    const t = setup();
    const { email } = await signedIn(t);

    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({ kind: 'deleted' });

    expect(t.backend.users.has(email)).toBe(false);
    expect(t.backend.sessions.size).toBe(0);
    expect(t.jar.cookies.size).toBe(0);
    expect(t.auditLog.entries).toEqual([]);
    expect(await t.api.getCurrentUser()).toBeNull();
  });

  it('[0002-AC6] a wrong, empty or oversized password deletes nothing and keeps the session', async () => {
    const t = setup();
    const { email, id } = await signedIn(t);
    for (const password of ['not the right password', '', 'x'.repeat(1025)]) {
      expect(await t.api.deleteAccount({ password }, ctx())).toEqual({ kind: 'wrong_password' });
    }
    expect(await t.api.deleteAccount({}, ctx())).toEqual({ kind: 'wrong_password' });
    expect(await t.api.deleteAccount('not an object', ctx())).toEqual({ kind: 'wrong_password' });
    expect(t.backend.users.has(email)).toBe(true);
    expect(await t.api.getCurrentUser()).toEqual({ id });
  });

  it('[0002-AC8] without a session: not_signed_in, before validation or rate limiting', async () => {
    const hits: string[] = [];
    const t = setup({ limiter: { hit: async (key) => (hits.push(key), { allowed: true }) } });
    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({
      kind: 'not_signed_in',
    });
    expect(await t.api.deleteAccount({ password: '' }, ctx())).toEqual({ kind: 'not_signed_in' });
    expect(hits).toEqual([]);
  });

  it('[0002-AC9] a client-supplied user ID or email is rejected; only the session user can be deleted', async () => {
    const t = setup();
    const victim = await signedIn(t);
    // The victim signs out; the attacker signs in on the same backend and browser.
    await t.api.logOut();
    const other = await signedIn(t);

    for (const extra of [{ userId: victim.id }, { email: victim.email }]) {
      expect(await t.api.deleteAccount({ password: PASSWORD, ...extra }, ctx())).toEqual({
        kind: 'wrong_password',
      });
    }
    expect(t.backend.users.has(victim.email)).toBe(true);
    expect(t.backend.users.has(other.email)).toBe(true);

    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({ kind: 'deleted' });
    expect(t.backend.users.has(other.email)).toBe(false);
    expect(t.backend.users.has(victim.email)).toBe(true);
  });

  it('[0002-AC7] limits per IP and per user ID, before the password is checked', async () => {
    const calls: string[] = [];
    const limiter: RateLimiter = {
      hit: async (key) => {
        calls.push(key);
        return { allowed: true };
      },
    };
    const t = setup({ limiter });
    const { id } = await signedIn(t);
    calls.length = 0; // ignore sign-up's own limits

    await t.api.deleteAccount({ password: 'not the right password' }, ctx('198.51.100.4'));

    expect(calls).toEqual([
      rateLimitKey(SECRET, 'delete_account', 'ip', '198.51.100.4'),
      rateLimitKey(SECRET, 'delete_account', 'user', id),
    ]);
  });

  it('[0002-AC7] after 5 attempts, even the right password is rate-limited and nothing is deleted', async () => {
    const t = setup();
    const { email } = await signedIn(t);
    for (let i = 0; i < 5; i++) {
      // A different IP each time: the per-user dimension stops it.
      await t.api.deleteAccount({ password: `wrong password ${i}` }, ctx(`198.51.100.${i}`));
    }
    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx('198.51.100.99'))).toEqual({
      kind: 'rate_limited',
    });
    expect(t.backend.users.has(email)).toBe(true);
  });

  it("maps the auth server's own rate limit to rate_limited", async () => {
    const t = setup();
    const { email } = await signedIn(t);
    t.backend.failures.set('verifyPassword', 'rate_limited');
    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({
      kind: 'rate_limited',
    });
    expect(t.backend.users.has(email)).toBe(true);
  });

  it.each(['getUser', 'verifyPassword', 'deleteUser'] as const)(
    '[0002-AC12] when %s is unavailable: failed, nothing deleted, and a retry succeeds',
    async (op) => {
      const t = setup();
      const { email } = await signedIn(t);
      t.backend.failures.set(op, 'unavailable');

      expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({ kind: 'failed' });
      expect(t.backend.users.has(email)).toBe(true);
      expect(t.logLines.map((l) => JSON.parse(l))).toContainEqual(
        expect.objectContaining({
          level: 'error',
          event: 'users.delete_account',
          outcome: 'failed',
          errorCode: 'unavailable',
        }),
      );

      t.backend.failures.delete(op);
      expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({ kind: 'deleted' });
      expect(t.backend.users.has(email)).toBe(false);
    },
  );

  it('[0002-AC12] fails closed when the rate limiter is unavailable', async () => {
    const t = setup({
      limiter: {
        hit: async () => {
          throw new RateLimiterError('unavailable');
        },
      },
    });
    // Signed in directly on the backend: the broken limiter also guards sign-up and log-in.
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UserId;
    t.backend.users.set('pre@example.com', {
      id,
      email: 'pre@example.com',
      password: PASSWORD,
      confirmed: true,
    });
    t.backend.sessions.set('session-1', id);
    t.jar.cookies.set(FAKE_SESSION_COOKIE, 'session-1');

    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({ kind: 'failed' });
    expect(t.backend.users.has('pre@example.com')).toBe(true);
  });

  it('[0002-AC12] is still deleted when erasing audit entries fails, and logs it', async () => {
    const t = setup();
    const { email } = await signedIn(t);
    t.auditLog.unavailable = true;

    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({ kind: 'deleted' });
    expect(t.backend.users.has(email)).toBe(false);
    const lines = t.logLines.map((l) => JSON.parse(l));
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        outcome: 'erase_failed',
        errorCode: 'unavailable',
      }),
    );
    expect(lines.at(-1)).toMatchObject({ event: 'users.delete_account', outcome: 'deleted' });
  });

  it('is still deleted when ending the session fails, and logs it', async () => {
    const t = setup();
    const { email } = await signedIn(t);
    t.backend.failures.set('signOut', 'unavailable');

    expect(await t.api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({ kind: 'deleted' });
    expect(t.backend.users.has(email)).toBe(false);
    expect(t.logLines.map((l) => JSON.parse(l))).toContainEqual(
      expect.objectContaining({ level: 'error', outcome: 'sign_out_failed' }),
    );
  });

  it('[0002-AC14] logs each outcome without email, password or user ID', async () => {
    const t = setup();
    const { email, id } = await signedIn(t);
    t.logLines.length = 0;
    await t.api.deleteAccount({ password: 'not the right password' }, ctx());
    await t.api.deleteAccount({ password: PASSWORD }, ctx());
    await t.api.deleteAccount({ password: PASSWORD }, ctx());

    expect(t.logLines.map((l) => JSON.parse(l))).toEqual([
      expect.objectContaining({ event: 'users.delete_account', outcome: 'wrong_password' }),
      expect.objectContaining({ event: 'users.delete_account', outcome: 'deleted' }),
      expect.objectContaining({ event: 'users.delete_account', outcome: 'not_signed_in' }),
    ]);
    const all = t.logLines.join('\n');
    for (const secret of [email, id, PASSWORD, 'not the right password']) {
      expect(all).not.toContain(secret);
    }
  });
});
