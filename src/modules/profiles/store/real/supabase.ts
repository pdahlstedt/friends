import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types.generated';
import { toUserId } from '@/lib/types/ids';
import { ProfilesError, type ProfilesErrorCode } from '../../errors';
import type { ProfileStore } from '../store';

// Supabase ProfileStore (ADR-0004). Excluded from unit coverage; verified by
// tests/contracts/profiles/profile-store.supabase.test.ts against local Supabase.

export type SupabaseProfileStoreClients = {
  /** Carries the viewer's session JWT (or none): RLS applies. Default for all reads. */
  userClient: SupabaseClient<Database>;
  /** Service role, bypasses RLS. Used only by insertIfMissing. */
  serviceClient: SupabaseClient<Database>;
};

// Postgres SQLSTATEs we translate; anything else is `unavailable`.
const ERROR_CODES: Record<string, ProfilesErrorCode> = {
  '42501': 'permission_denied', // insufficient_privilege
  '23503': 'user_not_found', // foreign_key_violation on auth.users
};

function storeError(error: PostgrestError): ProfilesError {
  // Never pass error.message/details on: they can contain row values.
  return new ProfilesError(ERROR_CODES[error.code] ?? 'unavailable');
}

export function createSupabaseProfileStore({
  userClient,
  serviceClient,
}: SupabaseProfileStoreClients): ProfileStore {
  return {
    async insertIfMissing(userId) {
      // INSERT … ON CONFLICT (user_id) DO NOTHING: idempotent and never modifies an existing row.
      const { error } = await serviceClient
        .schema('profiles')
        .from('profiles')
        .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (error) throw storeError(error);
    },

    async findOwn(userId) {
      const { data, error } = await userClient
        .schema('profiles')
        .from('profiles')
        .select('user_id, created_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw storeError(error);
      if (!data) return null;
      return { userId: toUserId(data.user_id), createdAt: new Date(data.created_at) };
    },
  };
}
