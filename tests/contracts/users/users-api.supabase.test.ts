import { randomBytes } from 'node:crypto';
import { createSupabaseAuth } from '@/lib/adapters/auth/real/supabase';
import { createPostgresRateLimiter } from '@/lib/adapters/rate-limit/real/postgres';
import { createProfilesApi, createSupabaseProfileStore } from '@/modules/profiles';
import { createUsersApi } from '@/modules/users';
import { db, closeDb } from '../../rls/support/db';
import { localSupabase } from '../../support/local-supabase';
import { waitForVerificationToken } from '../../support/mailpit';
import { serviceClient } from '../../support/roles';
import { usersApiContract } from './users-api.contract';

// Real-wired like src/server/container.ts will be: per request, one Supabase auth client bound to
// the browser's cookies, whose user-scoped client also backs the profile store.
usersApiContract('real-wired', async () => {
  const { apiUrl, anonKey } = localSupabase();
  const service = serviceClient();
  const limiter = createPostgresRateLimiter({ serviceClient: service });
  // A fresh secret per run: rate-limit keys never collide with earlier runs.
  const rateLimitSecret = randomBytes(32).toString('hex');

  return {
    apiFor: (jar) => {
      const { auth, userClient } = createSupabaseAuth({
        url: apiUrl,
        anonKey,
        cookies: jar,
        secureCookies: true,
      });
      const profiles = createProfilesApi({
        store: createSupabaseProfileStore({ userClient, serviceClient: service }),
      });
      return createUsersApi({ auth, profiles, limiter, rateLimitSecret });
    },
    nextToken: (email, alreadySeen) => waitForVerificationToken(email, alreadySeen),
    // Superuser checks: the service role deliberately cannot delete profiles.
    profileExists: async (userId) => {
      const rows = await db()`select 1 from profiles.profiles where user_id = ${userId}`;
      return rows.length === 1;
    },
    deleteProfile: async (userId) => {
      await db()`delete from profiles.profiles where user_id = ${userId}`;
    },
    cleanup: async () => {
      const admin = service.auth.admin;
      const { data } = await admin.listUsers({ perPage: 1000 });
      const ours = data.users.filter((u) => u.email?.startsWith('contract-users-'));
      await Promise.all(ours.map((u) => admin.deleteUser(u.id)));
      await closeDb();
    },
  };
});
