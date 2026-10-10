import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserId } from '@/lib/types/ids';
import type { UsersApi } from '@/modules/users';
import { createTestCookieJar, type TestCookieJar } from '../../support/cookie-jar';

// UsersApi module contract (spec 0001): each account flow end to end through the module's public
// API, fake-wired (in-memory adapters) and real-wired (local Supabase, Postgres rate limiter,
// Mailpit), wired only through module index.ts files like the composition root.

export type UsersApiHarness = {
  /** The API for one request from the browser `jar`. */
  apiFor(jar: TestCookieJar): UsersApi;
  /** Waits for the next verification email to `email` after `alreadySeen`; its token hash. */
  nextToken(email: string, alreadySeen: number): Promise<string>;
  profileExists(userId: UserId): Promise<boolean>;
  deleteProfile(userId: UserId): Promise<void>;
  /** Where anything about the user is still stored ("schema.table" or fake store names). */
  storedAbout(userId: UserId, email: string): Promise<string[]>;
  cleanup(): Promise<void>;
};

const PASSWORD = 'correct horse battery staple';

export function usersApiContract(name: string, makeHarness: () => Promise<UsersApiHarness>) {
  describe(`UsersApi contract: ${name}`, () => {
    let h: UsersApiHarness;
    const newEmail = () => `contract-users-${randomUUID()}@example.test`;
    // A fresh client IP per call keeps tests from sharing per-IP rate-limit buckets.
    const ctx = () => ({ clientIp: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}` });

    /** Signs up and confirms in a fresh browser; returns that browser and the user id. */
    async function confirmed(email = newEmail()) {
      expect(
        (await h.apiFor(createTestCookieJar()).signUp({ email, password: PASSWORD }, ctx())).kind,
      ).toBe('check_email');
      const jar = createTestCookieJar();
      const api = h.apiFor(jar);
      expect(await api.confirmEmail({ tokenHash: await h.nextToken(email, 0) })).toEqual({
        kind: 'confirmed',
      });
      const user = await api.getCurrentUser();
      if (!user) throw new Error('not signed in after confirm');
      return { email, jar, id: user.id };
    }

    beforeAll(async () => {
      h = await makeHarness();
    });

    afterAll(async () => {
      await h?.cleanup();
    });

    it('[0001-AC1] [0001-AC2] [0001-AC11] sign-up, confirm in another browser, signed in with a profile', async () => {
      const { id } = await confirmed();
      expect(await h.profileExists(id)).toBe(true);
    });

    it('[0001-AC5] a used or made-up link is invalid and signs nobody in', async () => {
      const email = newEmail();
      await h.apiFor(createTestCookieJar()).signUp({ email, password: PASSWORD }, ctx());
      const token = await h.nextToken(email, 0);
      await h.apiFor(createTestCookieJar()).confirmEmail({ tokenHash: token });

      for (const tokenHash of [token, 'pkce_0123456789abcdef0123456789abcdef']) {
        const api = h.apiFor(createTestCookieJar());
        expect(await api.confirmEmail({ tokenHash })).toEqual({ kind: 'invalid_link' });
        expect(await api.getCurrentUser()).toBeNull();
      }
    });

    it('[0001-AC4] sign-up with an existing email gets the same answer and changes nothing', async () => {
      const { email } = await confirmed();
      const api = h.apiFor(createTestCookieJar());
      expect(await api.signUp({ email, password: 'another password here' }, ctx())).toEqual({
        kind: 'check_email',
      });
      expect(await api.logIn({ email, password: PASSWORD }, ctx())).toEqual({ kind: 'logged_in' });
    });

    it('[0001-AC6] log-in signs in and (re)creates a missing profile', async () => {
      const { email, id } = await confirmed();
      await h.deleteProfile(id);

      const api = h.apiFor(createTestCookieJar());
      expect(await api.logIn({ email, password: PASSWORD }, ctx())).toEqual({ kind: 'logged_in' });
      expect(await api.getCurrentUser()).toEqual({ id });
      expect(await h.profileExists(id)).toBe(true);
    });

    it('[0001-AC7] a wrong password and an unknown email get the same answer', async () => {
      const { email } = await confirmed();
      const api = h.apiFor(createTestCookieJar());
      const wrong = await api.logIn({ email, password: 'not the password' }, ctx());
      const unknown = await api.logIn({ email: newEmail(), password: PASSWORD }, ctx());
      expect(wrong).toEqual({ kind: 'invalid_credentials' });
      expect(unknown).toEqual(wrong);
      expect(await api.getCurrentUser()).toBeNull();
    });

    it('[0001-AC8] an unconfirmed account is told to verify and can resend', async () => {
      const email = newEmail();
      const api = h.apiFor(createTestCookieJar());
      await api.signUp({ email, password: PASSWORD }, ctx());
      expect(await api.logIn({ email, password: PASSWORD }, ctx())).toEqual({
        kind: 'email_not_confirmed',
      });
      expect(await api.getCurrentUser()).toBeNull();
      expect(await api.resendVerification({ email }, ctx())).toEqual({
        kind: 'sent_if_applicable',
      });
    });

    it('[0001-AC9] after 5 attempts on one email, even the right password is rate-limited', async () => {
      const { email } = await confirmed();
      const api = h.apiFor(createTestCookieJar());
      for (let i = 0; i < 5; i++) await api.logIn({ email, password: 'not the password' }, ctx());
      expect(await api.logIn({ email, password: PASSWORD }, ctx())).toEqual({
        kind: 'rate_limited',
      });
      expect(await api.getCurrentUser()).toBeNull();
    });

    it('[0001-AC10] log-out ends the session server-side, including copies of the cookies', async () => {
      const { jar, id } = await confirmed();
      const stolen = jar.copy();
      expect(await h.apiFor(stolen).getCurrentUser()).toEqual({ id });

      await h.apiFor(jar).logOut();
      expect(await h.apiFor(jar).getCurrentUser()).toBeNull();
      expect(await h.apiFor(stolen).getCurrentUser()).toBeNull();
    });

    it('[0001-AC14] a client-supplied userId is rejected, never used', async () => {
      const { email, id } = await confirmed();
      const api = h.apiFor(createTestCookieJar());
      expect(await api.logIn({ email, password: PASSWORD, userId: id }, ctx())).toEqual({
        kind: 'invalid',
        fieldErrors: {},
      });
      expect(await api.getCurrentUser()).toBeNull();
    });

    describe('deleteAccount (spec 0002)', () => {
      it('[0002-AC2] [0002-AC4] deletes the account and everything about it, and signs out', async () => {
        const { email, id, jar } = await confirmed();
        expect(await h.storedAbout(id, email)).not.toEqual([]);

        expect(await h.apiFor(jar).deleteAccount({ password: PASSWORD }, ctx())).toEqual({
          kind: 'deleted',
        });

        expect(await h.apiFor(jar).getCurrentUser()).toBeNull();
        expect(await h.profileExists(id)).toBe(false);
        expect(await h.storedAbout(id, email)).toEqual([]);
      });

      it('[0002-AC3] [0002-AC5] afterwards the email is unknown, and can sign up as a new account', async () => {
        const { email, id, jar } = await confirmed();
        await h.apiFor(jar).deleteAccount({ password: PASSWORD }, ctx());

        const api = h.apiFor(createTestCookieJar());
        const unknown = await api.logIn({ email: newEmail(), password: PASSWORD }, ctx());
        expect(await api.logIn({ email, password: PASSWORD }, ctx())).toEqual(unknown);

        const again = await confirmed(email);
        expect(again.id).not.toBe(id);
        expect(await h.profileExists(again.id)).toBe(true);
      });

      it('[0002-AC6] a wrong password deletes nothing and keeps the session', async () => {
        const { id, jar } = await confirmed();
        const api = h.apiFor(jar);
        expect(await api.deleteAccount({ password: 'not the password' }, ctx())).toEqual({
          kind: 'wrong_password',
        });
        expect(await api.getCurrentUser()).toEqual({ id });
        expect(await h.profileExists(id)).toBe(true);
      });

      it('[0002-AC7] after 5 attempts, even the right password is rate-limited', async () => {
        const { id, jar } = await confirmed();
        const api = h.apiFor(jar);
        for (let i = 0; i < 5; i++) await api.deleteAccount({ password: `wrong ${i}` }, ctx());
        expect(await api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({
          kind: 'rate_limited',
        });
        expect(await api.getCurrentUser()).toEqual({ id });
      });

      it('[0002-AC8] without a session nothing happens', async () => {
        expect(
          await h.apiFor(createTestCookieJar()).deleteAccount({ password: PASSWORD }, ctx()),
        ).toEqual({ kind: 'not_signed_in' });
      });

      it('[0002-AC9] another user named in the input is never affected', async () => {
        const victim = await confirmed();
        const attacker = await confirmed();
        const api = h.apiFor(attacker.jar);
        expect(await api.deleteAccount({ password: PASSWORD, userId: victim.id }, ctx())).toEqual({
          kind: 'wrong_password',
        });
        expect(await api.deleteAccount({ password: PASSWORD }, ctx())).toEqual({
          kind: 'deleted',
        });
        expect(await h.apiFor(victim.jar).getCurrentUser()).toEqual({ id: victim.id });
        expect(await h.profileExists(victim.id)).toBe(true);
      });

      it('[0002-AC11] the session on another device stops working at once', async () => {
        const { email, jar } = await confirmed();
        const other = createTestCookieJar();
        await h.apiFor(other).logIn({ email, password: PASSWORD }, ctx());

        await h.apiFor(jar).deleteAccount({ password: PASSWORD }, ctx());

        expect(await h.apiFor(other).getCurrentUser()).toBeNull();
      });
    });
  });
}
