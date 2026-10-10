import { randomUUID } from 'node:crypto';
import { toUserId } from '@/lib/types/ids';
import { createSupabaseUserAccountStore } from '@/modules/users/store/real/supabase';
import { authLeftoversAbout, createUserWithAuthHistory } from '../../support/auth-history';
import { closeDb } from '../../support/db';
import { serviceClient } from '../../support/roles';
import { userAccountStoreContract, type AccountRef } from './user-account-store.contract';

// Real implementation against local Supabase. Users get the history the app gives them (a PKCE
// sign-up, a log-in); the superuser db() only reads what Auth keeps, which PostgREST does not
// expose.
userAccountStoreContract('supabase', async () => {
  const service = serviceClient();
  const active: AccountRef[] = [];
  const withHistory = async (): Promise<AccountRef> => {
    const { id, email } = await createUserWithAuthHistory();
    return { id: toUserId(id), email };
  };

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
    entriesAbout: authLeftoversAbout,
    unknownUserId: () => toUserId(randomUUID()),
    cleanup: async () => {
      for (const account of active) {
        await service.auth.admin.deleteUser(account.id);
        await service.schema('users').rpc('erase_auth_leftovers', { p_user_id: account.id });
      }
      await closeDb();
    },
  };
});
