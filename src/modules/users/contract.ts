// Public interface of the users module (spec 0001 plan). Other modules and the app depend only
// on this, via index.ts. No method takes a user ID from input (AC14). Further methods (confirm,
// log in, log out, current user) are added with 0001-T14.

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
}
