import { setTimeout as sleep } from 'node:timers/promises';
import { createSupabaseAuth } from '@/lib/adapters/auth/real/supabase';
import { closeDb, db } from '../../support/db';
import { localSupabase } from '../../support/local-supabase';
import { verificationTokens, waitForVerificationToken } from '../../support/mailpit';
import { serviceClient } from '../../support/roles';
import { authProviderContract } from './auth-provider.contract';

// Against local Supabase Auth; verification tokens come from the real emails in Mailpit.
authProviderContract('supabase', async () => {
  const { apiUrl, anonKey } = localSupabase();
  return {
    providerFor: (jar, options) =>
      createSupabaseAuth({
        url: apiUrl,
        anonKey,
        cookies: jar,
        secureCookies: options?.secureCookies ?? true,
        serviceClient: serviceClient(),
      }).auth,
    tokensSent: async (email) => (await verificationTokens(email)).length,
    nextToken: (email, alreadySeen) => waitForVerificationToken(email, alreadySeen),
    // supabase/config.toml: [auth.email] max_frequency = "1s".
    waitForEmailInterval: () => sleep(1_100),
    // auth.sessions is not exposed through PostgREST; read-only check with the superuser.
    sessionCount: async (userId) => {
      const [row] = await db()<{ n: number }[]>`
        select count(*)::int as n from auth.sessions where user_id = ${userId}`;
      return row!.n;
    },
    cleanup: async () => {
      const admin = serviceClient().auth.admin;
      const { data } = await admin.listUsers({ perPage: 1000 });
      const ours = data.users.filter((u) => u.email?.startsWith('contract-auth-'));
      await Promise.all(ours.map((u) => admin.deleteUser(u.id)));
      await closeDb();
    },
  };
});
