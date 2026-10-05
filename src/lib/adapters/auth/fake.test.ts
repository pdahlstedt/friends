import { describe, expect, it } from 'vitest';
import { AuthProviderError } from './auth-provider';
import { createFakeAuthBackend, createFakeAuthProvider, issuedTokenFor } from './fake';

// Fake-only controls that unit tests of the users module rely on. The shared behaviour is
// covered by tests/contracts/auth/auth-provider.contract.ts.

function setup() {
  const backend = createFakeAuthBackend();
  const provider = createFakeAuthProvider(backend, {
    cookies: { getAll: () => [], setAll: () => {} },
    secureCookies: true,
  });
  return { backend, provider };
}

describe('fake AuthProvider controls', () => {
  it('issuedTokenFor returns the newest token, matching the email case-insensitively', async () => {
    const { backend, provider } = setup();
    expect(issuedTokenFor(backend, 'a@example.com')).toBeUndefined();
    await provider.signUp('A@Example.com', 'password password');
    const first = issuedTokenFor(backend, 'a@example.com');
    await provider.resendVerification('a@example.com');
    const second = issuedTokenFor(backend, ' A@EXAMPLE.COM ');
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  it('can make each operation rate limited', async () => {
    const { backend, provider } = setup();
    for (const op of ['signUp', 'verify', 'signIn', 'resend'] as const) {
      backend.failures.set(op, 'rate_limited');
    }
    expect(await provider.signUp('a@example.com', 'pw')).toBe('rate_limited');
    expect(await provider.resendVerification('a@example.com')).toBe('rate_limited');
    expect(await provider.verifyEmailToken('t')).toEqual({ ok: false, reason: 'rate_limited' });
    expect(await provider.signInWithPassword('a@example.com', 'pw')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    expect(backend.users.size).toBe(0);
  });

  it.each(['signUp', 'verify', 'signIn', 'resend', 'signOut', 'getUser'] as const)(
    'can make %s throw unavailable',
    async (op) => {
      const { backend, provider } = setup();
      backend.failures.set(op, 'unavailable');
      const call = {
        signUp: () => provider.signUp('a@example.com', 'pw'),
        verify: () => provider.verifyEmailToken('t'),
        signIn: () => provider.signInWithPassword('a@example.com', 'pw'),
        resend: () => provider.resendVerification('a@example.com'),
        signOut: () => provider.signOut(),
        getUser: () => provider.getUser(),
      }[op];
      await expect(call()).rejects.toBeInstanceOf(AuthProviderError);
    },
  );
});
