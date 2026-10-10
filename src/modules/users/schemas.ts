import { z } from 'zod';

// Input validation for the users module (spec 0001, AC3, AC14). Every API input is `unknown` and
// parsed here. Objects are strict: unknown keys (e.g. a client-supplied userId) are rejected.

const utf8Bytes = (value: string) => Buffer.byteLength(value, 'utf8');
const characters = (value: string) => Array.from(value).length;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * At least 12 characters (Supabase counts characters too) and at most 72 UTF-8 bytes (bcrypt
 * silently ignores anything after 72 bytes). Never trimmed.
 */
export const passwordSchema = z
  .string()
  .refine((value) => characters(value) >= 12, { error: 'too_short' })
  .refine((value) => utf8Bytes(value) <= 72, { error: 'too_long' });

export const signUpInputSchema = z.strictObject({ email: emailSchema, password: passwordSchema });

export const resendInputSchema = z.strictObject({ email: emailSchema });

/** Log-in only checks shape: the sign-up policy would add nothing and could differ from old accounts. */
export const logInInputSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string()
    .min(1)
    .refine((value) => utf8Bytes(value) <= 1024, { error: 'too_long' }),
});

/** Supabase token hashes (e.g. `pkce_` + hex). Anything else is rejected before Supabase. */
export const confirmInputSchema = z.strictObject({
  tokenHash: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
});
