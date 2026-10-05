import type { z } from 'zod';
import type { AuthProvider } from '@/lib/adapters/auth/auth-provider';
import type { RateLimiter } from '@/lib/adapters/rate-limit/rate-limiter';
import { log as defaultLogger, type Logger } from '@/lib/log';
import { checkRateLimit, type RateLimitPolicy } from '@/lib/rate-limit/policy';
import { withMinimumDuration, type Clock } from '@/lib/security/timing';
import type { FieldErrors, RequestContext, UsersApi } from './contract';
import { RESEND_LIMIT, SIGN_UP_LIMIT } from './rate-limits';
import { resendInputSchema, signUpInputSchema } from './schemas';

// Account flows (spec 0001). Order for every flow that touches an account:
//   1. validate (cheap, reveals nothing about accounts);
//   2. our rate limit on IP and email (ADR-0005), before Supabase is called;
//   3. the auth provider.
// Steps 2–3 are padded to MINIMUM_DURATION_MS so outcomes can't be told apart by timing (AC4).

export const MINIMUM_DURATION_MS = 800;

export type UsersApiDeps = {
  /** Bound to the current request. */
  auth: AuthProvider;
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
};

/** User-facing field errors. Unknown keys (AC14) and non-object input give no field error. */
function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    if (issue.path[0] === 'email') errors.email = MESSAGES.email;
    if (issue.path[0] === 'password') {
      errors.password =
        issue.message === 'too_long' ? MESSAGES.passwordTooLong : MESSAGES.passwordTooShort;
    }
  }
  return errors;
}

export function createUsersApi({
  auth,
  limiter,
  rateLimitSecret,
  clock,
  logger = defaultLogger,
}: UsersApiDeps): UsersApi {
  const limited = (policy: RateLimitPolicy, ctx: RequestContext, email: string) =>
    checkRateLimit({ limiter, secret: rateLimitSecret }, policy, { ip: ctx.clientIp, email });

  /** Runs `fn` padded to the minimum duration and logs its outcome (never inputs). */
  async function guarded<T extends { kind: string }>(event: string, fn: () => Promise<T>) {
    try {
      const result = await withMinimumDuration(MINIMUM_DURATION_MS, fn, clock);
      logger.info({ event, outcome: result.kind });
      return result;
    } catch (error) {
      // Adapter errors carry a code only (never a vendor message), so it is safe to log.
      logger.error({
        event,
        outcome: 'error',
        errorCode: String((error as { code?: unknown }).code),
      });
      throw error;
    }
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
  };
}
