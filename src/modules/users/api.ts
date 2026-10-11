import type { z } from 'zod';
import type { AuthProvider } from '@/lib/adapters/auth/auth-provider';
import type { RateLimiter } from '@/lib/adapters/rate-limit/rate-limiter';
import { log as defaultLogger, type Logger } from '@/lib/log';
import type { UserId } from '@/lib/types/ids';
import { checkRateLimit, type RateLimitPolicy } from '@/lib/rate-limit/policy';
import type { ProfilesApi } from '@/modules/profiles';
import { withMinimumDuration, type Clock } from '@/lib/security/timing';
import type { FieldErrors, RequestContext, UsersApi } from './contract';
import { DELETE_ACCOUNT_LIMIT, LOG_IN_LIMIT, RESEND_LIMIT, SIGN_UP_LIMIT } from './rate-limits';
import type { UserAccountStore } from './store/store';
import {
  confirmInputSchema,
  deleteAccountInputSchema,
  logInInputSchema,
  resendInputSchema,
  signUpInputSchema,
} from './schemas';

// Account flows (spec 0001). Order for every flow that touches an account:
//   1. validate (cheap, reveals nothing about accounts);
//   2. our rate limit on IP and email (ADR-0005), before Supabase is called;
//   3. the auth provider;
//   4. after a successful confirm or log-in, profiles.ensureProfile (idempotent).
// Steps 2–3 are padded to MINIMUM_DURATION_MS so outcomes can't be told apart by timing (AC4).
//
// Account deletion (spec 0002, ADR-0006) has its own order; see deleteAccount below.

export const MINIMUM_DURATION_MS = 800;

export type UsersApiDeps = {
  /** Bound to the current request. */
  auth: AuthProvider;
  profiles: ProfilesApi;
  /** Erases what the auth server keeps about deleted users (ADR-0006). */
  accounts: UserAccountStore;
  limiter: RateLimiter;
  /** RATE_LIMIT_KEY_SECRET. */
  rateLimitSecret: string;
  clock?: Clock;
  logger?: Logger;
};

const MESSAGES = {
  email: 'Enter a valid email address.',
  passwordTooShort: 'Use at least 12 characters.',
  passwordTooLong: 'Use at most 72 characters.',
  passwordRequired: 'Enter your password.',
};

const signUpPasswordMessage = (issue: z.core.$ZodIssue) =>
  issue.message === 'too_long' ? MESSAGES.passwordTooLong : MESSAGES.passwordTooShort;

/** User-facing field errors. Unknown keys (AC14) and non-object input give no field error. */
function fieldErrors(
  error: z.ZodError,
  passwordMessage: (issue: z.core.$ZodIssue) => string = signUpPasswordMessage,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    if (issue.path[0] === 'email') errors.email = MESSAGES.email;
    if (issue.path[0] === 'password') errors.password = passwordMessage(issue);
  }
  return errors;
}

type DeleteAccountResult =
  | { kind: 'deleted'; userId: UserId }
  | { kind: 'not_signed_in' | 'wrong_password' | 'rate_limited' };

/** Adapter and store errors carry a code only (never a vendor message), so it is safe to log. */
const errorCode = (error: unknown) => String((error as { code?: unknown }).code);

export function createUsersApi({
  auth,
  profiles,
  accounts,
  limiter,
  rateLimitSecret,
  clock,
  logger = defaultLogger,
}: UsersApiDeps): UsersApi {
  const limited = (policy: RateLimitPolicy, ctx: RequestContext, email: string) =>
    checkRateLimit({ limiter, secret: rateLimitSecret }, policy, { ip: ctx.clientIp, email });

  /** Runs `fn` (padded to the minimum duration unless `pad` is false) and logs its outcome. */
  async function guarded<T extends { kind: string }>(
    event: string,
    fn: () => Promise<T>,
    pad = true,
  ) {
    try {
      const result = pad ? await withMinimumDuration(MINIMUM_DURATION_MS, fn, clock) : await fn();
      logger.info({ event, outcome: result.kind });
      return result;
    } catch (error) {
      logger.error({ event, outcome: 'error', errorCode: errorCode(error) });
      throw error;
    }
  }

  /** Steps up to and including the delete. Throws on adapter or limiter errors (AC12). */
  async function deleteIfAllowed(
    input: unknown,
    ctx: RequestContext,
  ): Promise<DeleteAccountResult> {
    const user = await auth.getUser(); // identity only from the session (AC9)
    if (!user) return { kind: 'not_signed_in' };
    const parsed = deleteAccountInputSchema.safeParse(input);
    if (!parsed.success) return { kind: 'wrong_password' }; // empty, oversized or extra keys
    const limit = await checkRateLimit({ limiter, secret: rateLimitSecret }, DELETE_ACCOUNT_LIMIT, {
      ip: ctx.clientIp,
      user: user.id,
    });
    if (!limit.allowed) return { kind: 'rate_limited' };
    const verified = await auth.verifyPassword(parsed.data.password);
    if (verified === 'invalid') return { kind: 'wrong_password' };
    if (verified === 'rate_limited') return { kind: 'rate_limited' };
    await auth.deleteUser(user.id);
    return { kind: 'deleted', userId: user.id };
  }

  return {
    async signUp(input, ctx) {
      const event = 'users.sign_up';
      const parsed = signUpInputSchema.safeParse(input);
      if (!parsed.success) {
        logger.info({ event, outcome: 'invalid' });
        return { kind: 'invalid', fieldErrors: fieldErrors(parsed.error) };
      }
      const { email, password } = parsed.data;

      return guarded(event, async () => {
        if (!(await limited(SIGN_UP_LIMIT, ctx, email)).allowed) {
          return { kind: 'rate_limited' as const };
        }
        // 'ok' for new and existing emails alike (AC4).
        const outcome = await auth.signUp(email, password);
        return outcome === 'ok'
          ? { kind: 'check_email' as const }
          : { kind: 'rate_limited' as const };
      });
    },

    async resendVerification(input, ctx) {
      const event = 'users.resend_verification';
      const parsed = resendInputSchema.safeParse(input);
      if (!parsed.success) {
        logger.info({ event, outcome: 'invalid' });
        return { kind: 'invalid', fieldErrors: fieldErrors(parsed.error) };
      }
      const { email } = parsed.data;

      return guarded(event, async () => {
        if (!(await limited(RESEND_LIMIT, ctx, email)).allowed) {
          return { kind: 'rate_limited' as const };
        }
        const outcome = await auth.resendVerification(email);
        return outcome === 'ok'
          ? { kind: 'sent_if_applicable' as const }
          : { kind: 'rate_limited' as const };
      });
    },

    // Not padded: a token reveals nothing about which emails have accounts.
    async confirmEmail(input) {
      const event = 'users.confirm_email';
      const parsed = confirmInputSchema.safeParse(input);
      if (!parsed.success) {
        logger.info({ event, outcome: 'invalid_link' });
        return { kind: 'invalid_link' };
      }
      return guarded(
        event,
        async () => {
          const result = await auth.verifyEmailToken(parsed.data.tokenHash);
          if (!result.ok) {
            return result.reason === 'invalid'
              ? { kind: 'invalid_link' as const }
              : { kind: 'rate_limited' as const };
          }
          await profiles.ensureProfile(result.userId);
          return { kind: 'confirmed' as const };
        },
        false,
      );
    },

    async logIn(input, ctx) {
      const event = 'users.log_in';
      const parsed = logInInputSchema.safeParse(input);
      if (!parsed.success) {
        logger.info({ event, outcome: 'invalid' });
        return {
          kind: 'invalid',
          fieldErrors: fieldErrors(parsed.error, () => MESSAGES.passwordRequired),
        };
      }
      const { email, password } = parsed.data;

      return guarded(event, async () => {
        // Before Supabase, so the limit holds even with the right password (AC9).
        if (!(await limited(LOG_IN_LIMIT, ctx, email)).allowed) {
          return { kind: 'rate_limited' as const };
        }
        const result = await auth.signInWithPassword(email, password);
        if (!result.ok) return { kind: result.reason };
        await profiles.ensureProfile(result.userId);
        return { kind: 'logged_in' as const };
      });
    },

    async logOut() {
      await auth.signOut();
      logger.info({ event: 'users.log_out', outcome: 'logged_out' });
    },

    getCurrentUser: () => auth.getUser(),

    // Order (plan 0002): session → validate → our rate limit → password → delete (the commit
    // point: one transaction, cascading to module rows) → erase auth leftovers → end this
    // session. Anything failing up to the delete changes nothing, so the outcome is `failed` and
    // a retry is safe (AC12). After the delete the account is gone, so later failures are only
    // logged: the daily sweep and the proxy's session refresh clean up behind them.
    async deleteAccount(input, ctx) {
      const event = 'users.delete_account';
      let result: DeleteAccountResult;
      try {
        result = await deleteIfAllowed(input, ctx);
      } catch (error) {
        logger.error({ event, outcome: 'failed', errorCode: errorCode(error) });
        return { kind: 'failed' };
      }

      if (result.kind === 'deleted') {
        try {
          await accounts.eraseAuthLeftovers(result.userId);
        } catch (error) {
          logger.error({ event, outcome: 'erase_failed', errorCode: errorCode(error) });
        }
        try {
          await auth.signOut();
        } catch (error) {
          logger.error({ event, outcome: 'sign_out_failed', errorCode: errorCode(error) });
        }
      }
      logger.info({ event, outcome: result.kind });
      return { kind: result.kind };
    },
  };
}
