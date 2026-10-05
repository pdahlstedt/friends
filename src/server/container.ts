import 'server-only';
import { cookies, headers } from 'next/headers';
import type { CookieJar } from '@/lib/adapters/auth/cookies';
import { createSupabaseAuth } from '@/lib/adapters/auth/real/supabase';
import { createPostgresRateLimiter } from '@/lib/adapters/rate-limit/real/postgres';
import type { RateLimiter } from '@/lib/adapters/rate-limit/rate-limiter';
import { createServiceClient } from '@/lib/adapters/supabase/real/service-client';
import { env } from '@/lib/env';
import { clientIp } from '@/lib/http/client-ip';
import {
  createProfilesApi,
  createSupabaseProfileStore,
  type ProfilesApi,
} from '@/modules/profiles';
import { createUsersApi, type RequestContext, type UsersApi } from '@/modules/users';

// Composition root (spec 0001 plan): builds the per-request module APIs with the real adapters.
// Wiring only, no logic; covered by the system tests. Server-only: it holds the service-role key.

type NextCookie = Extract<Parameters<Awaited<ReturnType<typeof cookies>>['set']>[0], object>;

export type RequestServices = { users: UsersApi; profiles: ProfilesApi; ctx: RequestContext };

let shared: { service: ReturnType<typeof createServiceClient>; limiter: RateLimiter } | undefined;

/** Process-wide clients that carry no user state. */
function sharedServices() {
  if (!shared) {
    const { supabaseUrl, supabaseServiceRoleKey } = env();
    const service = createServiceClient(supabaseUrl, supabaseServiceRoleKey);
    shared = { service, limiter: createPostgresRateLimiter({ serviceClient: service }) };
  }
  return shared;
}

/** True in production builds; false only on the plain-http dev server. */
export const secureCookies = () => process.env.NODE_ENV === 'production';

export async function requestServices(): Promise<RequestServices> {
  const config = env();
  const { service, limiter } = sharedServices();
  const cookieStore = await cookies();

  const jar: CookieJar = {
    getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (toSet) => {
      try {
        for (const { name, value, options } of toSet) {
          // Options are already hardened by the adapter (HttpOnly, SameSite=Lax, Secure, host-only).
          cookieStore.set({ ...options, name, value } as NextCookie);
        }
      } catch {
        // Server Components cannot set cookies; src/proxy.ts refreshes sessions before render.
        // Server actions and route handlers can, so sign-in and sign-out always land here.
      }
    },
  };

  const { auth, userClient } = createSupabaseAuth({
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    cookies: jar,
    secureCookies: secureCookies(),
  });
  const profiles = createProfilesApi({
    store: createSupabaseProfileStore({ userClient, serviceClient: service }),
  });
  const users = createUsersApi({
    auth,
    profiles,
    limiter,
    rateLimitSecret: config.rateLimitKeySecret,
  });

  const ctx: RequestContext = { clientIp: clientIp(await headers(), config.trustedIpHeader) };
  return { users, profiles, ctx };
}
