import { randomUUID } from 'node:crypto';
import { toUserId, type UserId } from '@/lib/types/ids';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthProvider } from '@/lib/adapters/auth/auth-provider';
import { createTestCookieJar, type TestCookieJar } from '../../support/cookie-jar';

// AuthProvider contract (spec 0001: AC1, AC2, AC4–AC8, AC10, AC17; spec 0002: account deletion). Runs against the fake and
// local Supabase (tokens read from Mailpit). Each "browser" is a cookie jar; a provider is
// created per request, bound to one jar, like the app does.

export type AuthProviderHarness = {
  /** One request's provider, reading and writing `jar`. */
  providerFor(jar: TestCookieJar, options?: { secureCookies?: boolean }): AuthProvider;
  /** Number of verification emails sent to `email` so far. */
  tokensSent(email: string): Promise<number>;
  /** Waits for the next verification email after `alreadySeen` and returns its token hash. */
  nextToken(email: string, alreadySeen: number): Promise<string>;
  /** Lets the auth server's per-account email interval pass (real: ~1 s locally). */
  waitForEmailInterval(): Promise<void>;
  /** Number of live sessions the auth server holds for the user. */
  sessionCount(userId: UserId): Promise<number>;
  cleanup(): Promise<void>;
};

const PASSWORD = 'correct horse battery staple';

export function authProviderContract(
  name: string,
  makeHarness: () => Promise<AuthProviderHarness>,
) {
  describe(`AuthProvider contract: ${name}`, () => {
    let h: AuthProviderHarness;
    const newEmail = () => `contract-auth-${randomUUID()}@example.test`;
    const request = (jar = createTestCookieJar(), options?: { secureCookies?: boolean }) =>
      h.providerFor(jar, options);

    /** A signed-up, confirmed account; returns its id. */
    async function confirmedAccount(email: string, password = PASSWORD) {
      expect(await request().signUp(email, password)).toBe('ok');
      const result = await request().verifyEmailToken(await h.nextToken(email, 0));
      if (!result.ok) throw new Error('could not confirm test account');
      return result.userId;
    }

    beforeAll(async () => {
      h = await makeHarness();
    });

    afterAll(async () => {
      await h?.cleanup();
    });

    describe('sign-up and verification', () => {
      it('[0001-AC1] signUp sends a verification email and does not sign in', async () => {
        const email = newEmail();
        const jar = createTestCookieJar();
        expect(await request(jar).signUp(email, PASSWORD)).toBe('ok');
        expect(await h.nextToken(email, 0)).toMatch(/\S+/);
        expect(await request(jar).getUser()).toBeNull();
      });

      it('[0001-AC2] verifyEmailToken confirms and signs in on that request', async () => {
        const email = newEmail();
        await request().signUp(email, PASSWORD);
        const token = await h.nextToken(email, 0);

        // A different browser than the one that signed up: the link works on any device.
        const jar = createTestCookieJar();
        const result = await request(jar).verifyEmailToken(token);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(await request(jar).getUser()).toEqual({ id: result.userId });
      });

      it('[0001-AC5] a used, tampered or made-up token is invalid and signs nobody in', async () => {
        const email = newEmail();
        await request().signUp(email, PASSWORD);
        const token = await h.nextToken(email, 0);
        expect((await request().verifyEmailToken(token)).ok).toBe(true);

        for (const bad of [token, `${token.slice(0, -4)}abcd`, 'not-a-token']) {
          const jar = createTestCookieJar();
          expect(await request(jar).verifyEmailToken(bad)).toEqual({
            ok: false,
            reason: 'invalid',
          });
          expect(await request(jar).getUser()).toBeNull();
        }
      });

      it('[0001-AC4] signUp with an existing confirmed email is ok and changes nothing', async () => {
        const email = newEmail();
        await confirmedAccount(email);
        const sent = await h.tokensSent(email);

        expect(await request().signUp(email, 'a different password 123')).toBe('ok');
        expect((await request().signInWithPassword(email, PASSWORD)).ok).toBe(true);
        expect(await request().signInWithPassword(email, 'a different password 123')).toEqual({
          ok: false,
          reason: 'invalid_credentials',
        });
        expect(await h.tokensSent(email)).toBe(sent);
      });

      it('[0001-AC4] signUp with an existing unconfirmed email is ok, even right away', async () => {
        const email = newEmail();
        expect(await request().signUp(email, PASSWORD)).toBe('ok');
        expect(await request().signUp(email, PASSWORD)).toBe('ok');
      });
    });

    describe('resend', () => {
      it('resends a working token to an unconfirmed account', async () => {
        const email = newEmail();
        await request().signUp(email, PASSWORD);
        const first = await h.nextToken(email, 0);
        await h.waitForEmailInterval();

        expect(await request().resendVerification(email)).toBe('ok');
        const second = await h.nextToken(email, 1);
        expect(second).not.toBe(first);
        expect((await request().verifyEmailToken(second)).ok).toBe(true);
      });

      it('is ok, and sends nothing, for unknown and already-confirmed emails', async () => {
        const unknown = newEmail();
        expect(await request().resendVerification(unknown)).toBe('ok');
        expect(await h.tokensSent(unknown)).toBe(0);

        const confirmed = newEmail();
        await confirmedAccount(confirmed);
        const sent = await h.tokensSent(confirmed);
        expect(await request().resendVerification(confirmed)).toBe('ok');
        expect(await h.tokensSent(confirmed)).toBe(sent);
      });
    });

    describe('sign-in', () => {
      it('[0001-AC6] signs in a confirmed user with the right password', async () => {
        const email = newEmail();
        const id = await confirmedAccount(email);
        const jar = createTestCookieJar();
        expect(await request(jar).signInWithPassword(email, PASSWORD)).toEqual({
          ok: true,
          userId: id,
        });
        expect(await request(jar).getUser()).toEqual({ id });
      });

      it('[0001-AC7] wrong password and unknown email give the same invalid_credentials', async () => {
        const email = newEmail();
        await confirmedAccount(email);
        for (const [e, p] of [
          [email, 'wrong password wrong'],
          [newEmail(), PASSWORD],
        ] as const) {
          const jar = createTestCookieJar();
          expect(await request(jar).signInWithPassword(e, p)).toEqual({
            ok: false,
            reason: 'invalid_credentials',
          });
          expect(await request(jar).getUser()).toBeNull();
        }
      });

      it('[0001-AC8] an unconfirmed account gets email_not_confirmed and no session', async () => {
        const email = newEmail();
        await request().signUp(email, PASSWORD);
        const jar = createTestCookieJar();
        expect(await request(jar).signInWithPassword(email, PASSWORD)).toEqual({
          ok: false,
          reason: 'email_not_confirmed',
        });
        expect(await request(jar).getUser()).toBeNull();
      });
    });

    describe('sessions', () => {
      it('getUser is null without cookies or with a forged cookie', async () => {
        expect(await request().getUser()).toBeNull();

        const email = newEmail();
        await confirmedAccount(email);
        const jar = createTestCookieJar();
        await request(jar).signInWithPassword(email, PASSWORD);
        const forged = jar.copy();
        for (const name of forged.cookies.keys()) forged.cookies.set(name, 'forged');
        expect(await request(forged).getUser()).toBeNull();
      });

      it('[0001-AC10] signOut revokes the session server-side and clears its cookies', async () => {
        const email = newEmail();
        const id = await confirmedAccount(email);
        const jar = createTestCookieJar();
        await request(jar).signInWithPassword(email, PASSWORD);
        const stolen = jar.copy();
        expect(await request(stolen).getUser()).toEqual({ id }); // the copy works before…

        await request(jar).signOut();
        expect(jar.cookies.size).toBe(0);
        expect(await request(jar).getUser()).toBeNull();
        expect(await request(stolen).getUser()).toBeNull(); // …and not after.
      });

      it('signOut without a session is a no-op', async () => {
        await expect(request().signOut()).resolves.toBeUndefined();
      });

      it.each([true, false])(
        '[0001-AC17] session cookies are HttpOnly, SameSite=Lax, host-only, path / (secure: %s)',
        async (secureCookies) => {
          const email = newEmail();
          await confirmedAccount(email);
          const jar = createTestCookieJar();
          await request(jar, { secureCookies }).signInWithPassword(email, PASSWORD);

          const written = jar.writes.flatMap((w) => w.cookies);
          expect(written.length).toBeGreaterThan(0);
          for (const { options } of written) {
            expect(options).toMatchObject({
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
              secure: secureCookies,
            });
            expect(options.domain).toBeUndefined();
          }
          // Responses that set session cookies must never be cached.
          expect(jar.writes[0]!.headers['Cache-Control']).toContain('no-store');
        },
      );
    });

    describe('account deletion', () => {
      /** A confirmed account, signed in on its own browser. */
      async function signedIn() {
        const email = newEmail();
        const id = await confirmedAccount(email);
        const jar = createTestCookieJar();
        await request(jar).signInWithPassword(email, PASSWORD);
        return { email, id, jar };
      }

      it('[0002-AC2] verifyPassword accepts the right password and leaves the session as it is', async () => {
        const { id, jar } = await signedIn();
        const before = new Map(jar.cookies);
        const writes = jar.writes.length;
        const sessions = await h.sessionCount(id);

        expect(await request(jar).verifyPassword(PASSWORD)).toBe('ok');

        expect(await h.sessionCount(id)).toBe(sessions); // the check's own session is ended
        expect(jar.writes.length).toBe(writes);
        expect(jar.cookies).toEqual(before);
        expect(await request(jar).getUser()).toEqual({ id });
      });

      it('[0002-AC6] verifyPassword rejects a wrong password, and anyone signed out', async () => {
        const { id, jar } = await signedIn();
        expect(await request(jar).verifyPassword('not the right password')).toBe('invalid');
        expect(await request(jar).getUser()).toEqual({ id });
        expect(await request().verifyPassword(PASSWORD)).toBe('invalid');
      });

      it('[0002-AC11] deleteUser ends every session of the user, on every device', async () => {
        const first = await signedIn();
        const second = createTestCookieJar();
        await request(second).signInWithPassword(first.email, PASSWORD);

        await request(first.jar).deleteUser(first.id);

        expect(await request(first.jar).getUser()).toBeNull();
        expect(await request(second).getUser()).toBeNull();
      });

      it('[0002-AC3] after deleteUser, the old credentials look like an unknown account', async () => {
        const { email, id, jar } = await signedIn();
        await request(jar).deleteUser(id);
        const fresh = createTestCookieJar();
        expect(await request(fresh).signInWithPassword(email, PASSWORD)).toEqual({
          ok: false,
          reason: 'invalid_credentials',
        });
        expect(await request(fresh).getUser()).toBeNull();
      });

      it('[0002-AC2] signOut after deleteUser clears the cookies without failing', async () => {
        const { id, jar } = await signedIn();
        await request(jar).deleteUser(id);
        await expect(request(jar).signOut()).resolves.toBeUndefined();
        expect(jar.cookies.size).toBe(0);
      });

      it('[0002-AC12] deleteUser is idempotent and accepts an unknown user', async () => {
        const { id, jar } = await signedIn();
        await request(jar).deleteUser(id);
        await expect(request().deleteUser(id)).resolves.toBeUndefined();
        await expect(request().deleteUser(toUserId(randomUUID()))).resolves.toBeUndefined();
      });

      it('[0002-AC5] the email can sign up again, as a new account', async () => {
        const { email, id, jar } = await signedIn();
        await request(jar).deleteUser(id);
        const sent = await h.tokensSent(email);

        expect(await request().signUp(email, 'a brand new password')).toBe('ok');
        const result = await request().verifyEmailToken(await h.nextToken(email, sent));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.userId).not.toBe(id);
      });
    });
  });
}
