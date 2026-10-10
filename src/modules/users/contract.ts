import type { UserId } from '@/lib/types/ids';

// Public interface of the users module (spec 0001 plan). Other modules and the app depend only
// on this, via index.ts. No method takes a user ID from input (AC14): identity comes only from
// the server-verified session.

/** Derived server-side only. `clientIp` is the trusted-header IP or the shared "unknown" bucket. */
export type RequestContext = { clientIp: string };

export type FieldErrors = Partial<Record<'email' | 'password', string>>;

export interface UsersApi {
  /** Every input is `unknown` and validated inside. The same outcome for new and existing emails. */
  signUp(
    input: unknown,
    ctx: RequestContext,
  ): Promise<
    | { kind: 'check_email' }
    | { kind: 'invalid'; fieldErrors: FieldErrors }
    | { kind: 'rate_limited' }
  >;

  /** Sends a new verification email if the account exists and is unconfirmed; never says which. */
  resendVerification(
    input: unknown,
    ctx: RequestContext,
  ): Promise<
    | { kind: 'sent_if_applicable' }
    | { kind: 'invalid'; fieldErrors: FieldErrors }
    | { kind: 'rate_limited' }
  >;

  /** Confirms the email from the emailed token hash and signs the user in (AC2, AC5). */
  confirmEmail(
    input: unknown /* { tokenHash } */,
  ): Promise<{ kind: 'confirmed' } | { kind: 'invalid_link' } | { kind: 'rate_limited' }>;

  /** The same outcome for an unknown email and a wrong password (AC7). */
  logIn(
    input: unknown,
    ctx: RequestContext,
  ): Promise<
    | { kind: 'logged_in' }
    | { kind: 'invalid_credentials' }
    | { kind: 'email_not_confirmed' }
    | { kind: 'invalid'; fieldErrors: FieldErrors }
    | { kind: 'rate_limited' }
  >;

  /** Revokes the session server-side and clears the cookies (AC10). */
  logOut(): Promise<void>;

  /** Server-verified (auth.getUser), never decoded locally. */
  getCurrentUser(): Promise<{ id: UserId } | null>;
}
