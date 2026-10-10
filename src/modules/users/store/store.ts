import type { UserId } from '@/lib/types/ids';

// Storage for the users module (ADR-0004, ADR-0006). The users schema has no tables yet; this
// store erases what Supabase Auth keeps about a deleted user outside auth.users. Implementations: memory.ts (unit
// tests) and real/supabase.ts. Both must pass tests/contracts/users/user-account-store.contract.ts.

export interface UserAccountStore {
  /**
   * Privileged (service role): deletes the user's auth audit-log entries (including those that
   * carry their email) and PKCE flow states. Idempotent. Call only after the auth user has been
   * deleted.
   * Throws UsersError `unavailable` on failure.
   */
  eraseAuthLeftovers(userId: UserId): Promise<void>;
}
