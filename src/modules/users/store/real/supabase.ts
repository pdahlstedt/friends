import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types.generated';
import { UsersError } from '../../errors';
import type { UserAccountStore } from '../store';

// Supabase UserAccountStore (ADR-0004, ADR-0006). Excluded from unit coverage; verified by
// tests/contracts/users/user-account-store.supabase.test.ts against local Supabase.

export type SupabaseUserAccountStoreClients = {
  /** Service role. users.erase_auth_audit is executable by nobody else. */
  serviceClient: SupabaseClient<Database>;
};

export function createSupabaseUserAccountStore({
  serviceClient,
}: SupabaseUserAccountStoreClients): UserAccountStore {
  return {
    async eraseAuthAuditEntries(userId) {
      const { error } = await serviceClient
        .schema('users')
        .rpc('erase_auth_audit', { p_user_id: userId });
      // Never pass error.message/details on: they can contain row values.
      if (error) throw new UsersError('unavailable');
    },
  };
}
