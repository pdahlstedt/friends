import type { UserId } from '@/lib/types/ids';

// AuthProvider adapter interface (spec 0001 plan, "Adapters"). An instance is bound to one
// request: it reads and writes that request's session cookies through a CookieJar.
// Implementations: fake.ts (unit tests) and real/supabase.ts. Both must pass
// tests/contracts/auth/auth-provider.contract.ts.

export interface AuthProvider {
  /**
   * Starts sign-up and sends the verification email. Same outcome for new and existing emails,
   * and never changes an existing account (AC4).
   */
  signUp(email: string, password: string): Promise<'ok' | 'rate_limited'>;

  /** Verifies the emailed token hash and signs the user in on this request (AC2, AC5). */
  verifyEmailToken(
    tokenHash: string,
  ): Promise<{ ok: true; userId: UserId } | { ok: false; reason: 'invalid' | 'rate_limited' }>;

  signInWithPassword(
    email: string,
    password: string,
  ): Promise<
    | { ok: true; userId: UserId }
    | { ok: false; reason: 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' }
  >;

  /** Same outcome whether or not the account exists or is already confirmed. */
  resendVerification(email: string): Promise<'ok' | 'rate_limited'>;

  /** Revokes this session's refresh token server-side and clears the session cookies (AC10). */
  signOut(): Promise<void>;

  /** The signed-in user, verified against the auth server (never decoded locally), or null. */
  getUser(): Promise<{ id: UserId } | null>;

  /**
   * Checks the password of this request's signed-in user, without changing the session
   * (spec 0002). `invalid` for a wrong password and when nobody is signed in.
   */
  verifyPassword(password: string): Promise<'ok' | 'invalid' | 'rate_limited'>;

  /**
   * Privileged (service role): hard-deletes the user with their sessions and, by cascade, every
   * module row, in one transaction (ADR-0006). Idempotent: an unknown user counts as deleted.
   * Callers must have verified the user server-side first.
   */
  deleteUser(userId: UserId): Promise<void>;
}

export type AuthProviderErrorCode = 'unavailable';

/** Unexpected auth failures. Carries a code only; vendor messages never leave the adapter. */
export class AuthProviderError extends Error {
  constructor(readonly code: AuthProviderErrorCode) {
    super(`Auth provider error: ${code}`);
    this.name = 'AuthProviderError';
  }
}
