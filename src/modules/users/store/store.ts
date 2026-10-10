import type { UserId } from '@/lib/types/ids';

// Storage for the users module (ADR-0004, ADR-0006). The users schema has no tables yet; this
// store erases what Supabase Auth keeps about a deleted user. Implementations: memory.ts (unit
// tests) and real/supabase.ts. Both must pass tests/contracts/users/user-account-store.contract.ts.

export interface UserAccountStore {
  /**
   * Privileged (service role): deletes every auth audit-log entry about the user, including
   * entries that carry their email. Idempotent. Call only after the auth user has been deleted.
   * Throws UsersError `unavailable` on failure.
   */
  eraseAuthAuditEntries(userId: UserId): Promise<void>;
}
