import { randomBytes, randomUUID } from 'node:crypto';
import { toUserId } from '@/lib/types/ids';
import { createSupabaseUserAccountStore } from '@/modules/users/store/real/supabase';
import { closeDb, db } from '../../support/db';
import { anonClient, serviceClient } from '../../support/roles';
import { userAccountStoreContract, type AccountRef } from './user-account-store.contract';

// Real implementation against local Supabase. Audit history is created the way users create it
// (sign-up through the admin API, a password log-in, an admin delete); the superuser db() only
// reads auth.audit_log_entries, which PostgREST does not expose.
userAccountStoreContract('supabase', async () => {
  const service = serviceClient();
  const active: AccountRef[] = [];

  async function withHistory(): Promise<AccountRef> {
    const email = `store-${randomUUID()}@example.test`;
    const password = randomBytes(24).toString('base64url');
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    const { error: signInError } = await anonClient().auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
    return { id: toUserId(data.user.id), email };
  }

  return {
    store: createSupabaseUserAccountStore({ serviceClient: service }),
    activeUser: async () => {
      const account = await withHistory();
      active.push(account);
      return account;
    },
    deletedUser: async () => {
      const account = await withHistory();
      const { error } = await service.auth.admin.deleteUser(account.id);
      if (error) throw new Error(`deleteUser failed: ${error.message}`);
      return account;
    },
    entriesAbout: async ({ id, email }) => {
      const [row] = await db()<{ n: number }[]>`
        select count(*)::int as n from auth.audit_log_entries
        where payload::text like ${'%' + id + '%'}
           or lower(payload::text) like ${'%' + email.toLowerCase() + '%'}`;
      return row!.n;
    },
    unknownUserId: () => toUserId(randomUUID()),
    cleanup: async () => {
      for (const account of active) {
        await service.auth.admin.deleteUser(account.id);
        await service.schema('users').rpc('erase_auth_audit', { p_user_id: account.id });
      }
      await closeDb();
    },
  };
});
