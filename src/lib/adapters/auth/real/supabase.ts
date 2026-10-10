import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types.generated';
import { toUserId } from '@/lib/types/ids';
import type { AuthProvider } from '../auth-provider';
import { hardenCookieOptions, type CookieJar } from '../cookies';
import {
  getUserOutcome,
  resendOutcome,
  signInOutcome,
  signOutOutcome,
  signUpOutcome,
  verifyOutcome,
} from '../errors';

// Supabase Auth via a @supabase/ssr server client bound to one request's cookies (plan,
// "Adapters"). Logic-free binding: outcomes come from ../errors.ts. Excluded from unit
// coverage; verified by tests/contracts/auth/auth-provider.supabase.test.ts.
//
// @supabase/ssr always uses the PKCE flow. The emailed token hash is still verified with
// verifyOtp, which needs no code-verifier cookie, so the link works on any device (AC2).

export type SupabaseAuthOptions = {
  url: string;
  anonKey: string;
  cookies: CookieJar;
  /** Secure cookies: true except on the plain-http dev server. */
  secureCookies: boolean;
};

export type SupabaseAuth = {
  auth: AuthProvider;
  /** The same request's client, carrying the user's session: for user-scoped (RLS) queries. */
  userClient: SupabaseClient<Database>;
};

export function createSupabaseAuth({
  url,
  anonKey,
  cookies,
  secureCookies,
}: SupabaseAuthOptions): SupabaseAuth {
  const client = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet, headers) =>
        cookies.setAll(
          toSet.map(({ name, value, options }) => ({
            name,
            value,
            options: hardenCookieOptions(options, { secure: secureCookies }),
          })),
          headers,
        ),
    },
  });

  const auth: AuthProvider = {
    async signUp(email, password) {
      const { error } = await client.auth.signUp({ email, password });
      return signUpOutcome(error);
    },

    async verifyEmailToken(tokenHash) {
      const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      const outcome = verifyOutcome(error);
      if (!outcome.ok) return outcome;
      return data.user
        ? { ok: true, userId: toUserId(data.user.id) }
        : { ok: false, reason: 'invalid' };
    },

    async signInWithPassword(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      const outcome = signInOutcome(error);
      if (!outcome.ok) return outcome;
      return { ok: true, userId: toUserId(data.user!.id) };
    },

    async resendVerification(email) {
      const { error } = await client.auth.resend({ type: 'signup', email });
      return resendOutcome(error);
    },

    async signOut() {
      // scope 'local': revoke this session's refresh token (this device), clear its cookies.
      const { error } = await client.auth.signOut({ scope: 'local' });
      signOutOutcome(error);
    },

    async getUser() {
      // Verified by the auth server on every call; never trusts the cookie's JWT by itself.
      const { data, error } = await client.auth.getUser();
      if (getUserOutcome(error) === 'signed_out' || !data.user) return null;
      return { id: toUserId(data.user.id) };
    },
  };

  return { auth, userClient: client };
}
