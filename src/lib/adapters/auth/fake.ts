import { randomBytes, randomUUID } from 'node:crypto';
import { toUserId, type UserId } from '@/lib/types/ids';
import { AuthProviderError, type AuthProvider } from './auth-provider';
import { NO_STORE_HEADERS, hardenCookieOptions, type CookieJar } from './cookies';

// In-memory AuthProvider for unit tests. One backend (users, tokens, sessions) is shared by many
// requests; each provider is bound to one request's cookie jar, like the Supabase one. Behaves
// like Supabase Auth with email confirmation on (see the contract suite).

type FakeUser = { id: UserId; email: string; password: string; confirmed: boolean };

export type FakeAuthOperation = 'signUp' | 'verify' | 'signIn' | 'resend' | 'signOut' | 'getUser';

export type FakeAuthBackend = {
  readonly users: Map<string, FakeUser>;
  /** Current verification token per unconfirmed user (one at a time, like Supabase). */
  readonly tokens: Map<string, UserId>;
  /** Every token ever sent, per email, newest last (the "inbox"). */
  readonly sent: Map<string, string[]>;
  readonly sessions: Map<string, UserId>;
  /** Makes an operation answer rate_limited, or throw unavailable, until removed. */
  readonly failures: Map<FakeAuthOperation, 'rate_limited' | 'unavailable'>;
};

export const FAKE_SESSION_COOKIE = 'fake-auth-session';
const SESSION_MAX_AGE = 400 * 24 * 60 * 60;

export function createFakeAuthBackend(): FakeAuthBackend {
  return {
    users: new Map(),
    tokens: new Map(),
    sent: new Map(),
    sessions: new Map(),
    failures: new Map(),
  };
}

/** The newest verification token sent to `email`, as a test would read it from the inbox. */
export function issuedTokenFor(backend: FakeAuthBackend, email: string): string | undefined {
  return backend.sent.get(normalize(email))?.at(-1);
}

const normalize = (email: string) => email.trim().toLowerCase();

export type FakeAuthProviderOptions = { cookies: CookieJar; secureCookies: boolean };

export function createFakeAuthProvider(
  backend: FakeAuthBackend,
  { cookies, secureCookies }: FakeAuthProviderOptions,
): AuthProvider {
  /** Throws unavailable, or reports whether the operation is rate limited. */
  const rateLimited = (op: FakeAuthOperation) => {
    const failure = backend.failures.get(op);
    if (failure === 'unavailable') throw new AuthProviderError('unavailable');
    return failure === 'rate_limited';
  };

  const sendToken = (user: FakeUser) => {
    for (const [token, id] of backend.tokens) if (id === user.id) backend.tokens.delete(token);
    const token = randomBytes(24).toString('hex');
    backend.tokens.set(token, user.id);
    backend.sent.set(user.email, [...(backend.sent.get(user.email) ?? []), token]);
  };

  const writeSession = (value: string, maxAge: number) => {
    const options = hardenCookieOptions({ maxAge }, { secure: secureCookies });
    cookies.setAll([{ name: FAKE_SESSION_COOKIE, value, options }], { ...NO_STORE_HEADERS });
  };

  const startSession = (userId: UserId) => {
    const sessionId = randomBytes(24).toString('hex');
    backend.sessions.set(sessionId, userId);
    writeSession(sessionId, SESSION_MAX_AGE);
  };

  const currentSessionId = () =>
    cookies.getAll().find((c) => c.name === FAKE_SESSION_COOKIE)?.value;

  return {
    async signUp(email, password) {
      if (rateLimited('signUp')) return 'rate_limited';
      const key = normalize(email);
      if (backend.users.has(key)) return 'ok'; // existing account: unchanged, same outcome
      const user: FakeUser = { id: toUserId(randomUUID()), email: key, password, confirmed: false };
      backend.users.set(key, user);
      sendToken(user);
      return 'ok';
    },

    async verifyEmailToken(tokenHash) {
      if (rateLimited('verify')) return { ok: false, reason: 'rate_limited' };
      const userId = backend.tokens.get(tokenHash);
      const user = [...backend.users.values()].find((u) => u.id === userId);
      if (!user) return { ok: false, reason: 'invalid' };
      backend.tokens.delete(tokenHash); // single use
      user.confirmed = true;
      startSession(user.id);
      return { ok: true, userId: user.id };
    },

    async signInWithPassword(email, password) {
      if (rateLimited('signIn')) return { ok: false, reason: 'rate_limited' };
      const user = backend.users.get(normalize(email));
      if (!user || user.password !== password) return { ok: false, reason: 'invalid_credentials' };
      if (!user.confirmed) return { ok: false, reason: 'email_not_confirmed' };
      startSession(user.id);
      return { ok: true, userId: user.id };
    },

    async resendVerification(email) {
      if (rateLimited('resend')) return 'rate_limited';
      const user = backend.users.get(normalize(email));
      if (user && !user.confirmed) sendToken(user);
      return 'ok';
    },

    async signOut() {
      rateLimited('signOut');
      const sessionId = currentSessionId();
      if (sessionId === undefined) return;
      backend.sessions.delete(sessionId);
      writeSession('', 0);
    },

    async getUser() {
      rateLimited('getUser');
      const userId = backend.sessions.get(currentSessionId() ?? '');
      const user = [...backend.users.values()].find((u) => u.id === userId);
      return user ? { id: user.id } : null;
    },
  };
}
