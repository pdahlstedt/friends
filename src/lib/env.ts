import 'server-only';
import { z } from 'zod';

// Validated server environment. Secrets are read only here (spec 0001 plan, "Secrets").
// There are deliberately no NEXT_PUBLIC_* Supabase variables: the browser has no Supabase access (ADR-0004).

const schema = z.object({
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // HMAC key for rate-limit bucket keys (ADR-0005).
  RATE_LIMIT_KEY_SECRET: z.string().min(32),
  // The one header trusted for the client IP, e.g. CF-Connecting-IP (ADR-0005). Unset means
  // every request shares one "unknown" bucket, which fails closed.
  TRUSTED_IP_HEADER: z
    .string()
    .regex(/^[A-Za-z0-9-]*$/)
    .optional()
    .transform((value) => value?.toLowerCase() || undefined),
});

export type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  rateLimitKeySecret: string;
  /** Lower-cased header name, or undefined when not configured. */
  trustedIpHeader: string | undefined;
};

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Names only: values may be secrets.
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  const value = result.data;
  return {
    supabaseUrl: value.SUPABASE_URL,
    supabaseAnonKey: value.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: value.SUPABASE_SERVICE_ROLE_KEY,
    rateLimitKeySecret: value.RATE_LIMIT_KEY_SECRET,
    trustedIpHeader: value.TRUSTED_IP_HEADER,
  };
}

let cached: Env | undefined;

/** Parsed on first use, not at import, so `next build` does not need runtime secrets. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
