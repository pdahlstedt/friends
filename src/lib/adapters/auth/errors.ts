import { AuthProviderError } from './auth-provider';

// Maps auth-server errors to adapter outcomes, one function per operation. Pure, so the vendor
// binding in real/ stays logic-free. Error codes: Supabase Auth (GoTrue) error codes.

export type AuthErrorLike = { status?: number | undefined; code?: string | undefined };

const isRateLimit = (e: AuthErrorLike) => e.status === 429 || e.code?.startsWith('over_') === true;

// GoTrue returns these only when the account already exists (or was emailed moments ago).
// Surfacing them would reveal whether an email has an account (AC4), so sign-up and resend
// report them as ok. Our own limiter (ADR-0005) is the rate limit users actually see.
const ACCOUNT_SPECIFIC = new Set([
  'user_already_exists',
  'email_exists',
  'over_email_send_rate_limit',
]);

const isClientError = (e: AuthErrorLike) =>
  e.status !== undefined && e.status >= 400 && e.status < 500;

const unavailable = () => new AuthProviderError('unavailable');

export function signUpOutcome(error: AuthErrorLike | null): 'ok' | 'rate_limited' {
  if (!error || ACCOUNT_SPECIFIC.has(error.code ?? '')) return 'ok';
  if (isRateLimit(error)) return 'rate_limited';
  throw unavailable();
}

export function resendOutcome(error: AuthErrorLike | null): 'ok' | 'rate_limited' {
  return signUpOutcome(error);
}

export function verifyOutcome(
  error: AuthErrorLike | null,
): { ok: true } | { ok: false; reason: 'invalid' | 'rate_limited' } {
  if (!error) return { ok: true };
  if (isRateLimit(error)) return { ok: false, reason: 'rate_limited' };
  if (isClientError(error)) return { ok: false, reason: 'invalid' };
  throw unavailable();
}

export function signInOutcome(
  error: AuthErrorLike | null,
):
  | { ok: true }
  | { ok: false; reason: 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' } {
  if (!error) return { ok: true };
  if (error.code === 'invalid_credentials') return { ok: false, reason: 'invalid_credentials' };
  if (error.code === 'email_not_confirmed') return { ok: false, reason: 'email_not_confirmed' };
  if (isRateLimit(error)) return { ok: false, reason: 'rate_limited' };
  throw unavailable();
}

/** Any 4xx means no valid session (missing, revoked, expired, deleted user): signed out. */
export function getUserOutcome(error: AuthErrorLike | null): 'signed_in' | 'signed_out' {
  if (!error) return 'signed_in';
  if (isClientError(error)) return 'signed_out';
  throw unavailable();
}

/** A 4xx means the session is already gone, which is the goal. */
export function signOutOutcome(error: AuthErrorLike | null): void {
  if (error && !isClientError(error)) throw unavailable();
}

/** Re-authentication of the signed-in user (spec 0002): only a wrong password is `invalid`. */
export function verifyPasswordOutcome(
  error: AuthErrorLike | null,
): 'ok' | 'invalid' | 'rate_limited' {
  if (!error) return 'ok';
  if (error.code === 'invalid_credentials') return 'invalid';
  if (isRateLimit(error)) return 'rate_limited';
  throw unavailable();
}

/** A user that is already gone counts as deleted, so a retried deletion succeeds (spec 0002, AC12). */
export function deleteUserOutcome(error: AuthErrorLike | null): void {
  if (!error || error.status === 404 || error.code === 'user_not_found') return;
  throw unavailable();
}
