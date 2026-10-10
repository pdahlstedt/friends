import { describe, expect, it } from 'vitest';
import { AuthProviderError } from './auth-provider';
import { toUserId } from '@/lib/types/ids';
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
    for (const op of ['signUp', 'verify', 'signIn', 'resend', 'verifyPassword'] as const) {
      backend.failures.set(op, 'rate_limited');
    }
    expect(await provider.signUp('a@example.com', 'pw')).toBe('rate_limited');
    expect(await provider.resendVerification('a@example.com')).toBe('rate_limited');
    expect(await provider.verifyEmailToken('t')).toEqual({ ok: false, reason: 'rate_limited' });
    expect(await provider.signInWithPassword('a@example.com', 'pw')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    expect(await provider.verifyPassword('pw')).toBe('rate_limited');
    expect(backend.users.size).toBe(0);
  });

  it.each([
    'signUp',
    'verify',
    'signIn',
    'resend',
    'signOut',
    'getUser',
    'verifyPassword',
    'deleteUser',
  ] as const)('can make %s throw unavailable', async (op) => {
    const { backend, provider } = setup();
    backend.failures.set(op, 'unavailable');
    const call = {
      signUp: () => provider.signUp('a@example.com', 'pw'),
      verify: () => provider.verifyEmailToken('t'),
      signIn: () => provider.signInWithPassword('a@example.com', 'pw'),
      resend: () => provider.resendVerification('a@example.com'),
      signOut: () => provider.signOut(),
      getUser: () => provider.getUser(),
      verifyPassword: () => provider.verifyPassword('pw'),
      deleteUser: () => provider.deleteUser(toUserId('7c9e6679-7425-40de-944b-e07fc1f90ae7')),
    }[op];
    await expect(call()).rejects.toBeInstanceOf(AuthProviderError);
  });

  it('[0002-AC4] tells onUserDeleted listeners about each deleted user, once', async () => {
    const { backend, provider } = setup();
    await provider.signUp('a@example.com', 'password password');
    const userId = backend.users.get('a@example.com')!.id;
    const deleted: string[] = [];
    backend.onUserDeleted.add((id) => deleted.push(id));

    await provider.deleteUser(userId);
    await provider.deleteUser(userId); // already gone: no second notification

    expect(deleted).toEqual([userId]);
    expect(backend.users.size).toBe(0);
    expect(backend.tokens.size).toBe(0);
  });
});
