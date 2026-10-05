import { setTimeout as sleep } from 'node:timers/promises';
import { createSupabaseAuth } from '@/lib/adapters/auth/real/supabase';
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
      }).auth,
    tokensSent: async (email) => (await verificationTokens(email)).length,
    nextToken: (email, alreadySeen) => waitForVerificationToken(email, alreadySeen),
    // supabase/config.toml: [auth.email] max_frequency = "1s".
    waitForEmailInterval: () => sleep(1_100),
    cleanup: async () => {
      const admin = serviceClient().auth.admin;
      const { data } = await admin.listUsers({ perPage: 1000 });
      const ours = data.users.filter((u) => u.email?.startsWith('contract-auth-'));
      await Promise.all(ours.map((u) => admin.deleteUser(u.id)));
    },
  };
});
