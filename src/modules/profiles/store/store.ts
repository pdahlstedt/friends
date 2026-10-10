import type { UserId } from '@/lib/types/ids';

// Storage for the profiles module's own table, profiles.profiles (ADR-0004).
// Implementations: memory.ts (unit tests) and real/supabase.ts. Both must pass
// tests/contracts/profiles/profile-store.contract.ts.

export type ProfileRecord = { userId: UserId; createdAt: Date };

/**
 * A store is bound to one viewer: the signed-in user whose session the user-scoped reads run
 * under, or null for an anonymous request.
 */
export interface ProfileStore {
  /**
   * Privileged (service role): creates the user's profile if it does not exist and never changes
   * an existing one. Callers must have verified the user server-side first.
   */
  insertIfMissing(userId: UserId): Promise<void>;

  /**
   * User-scoped (RLS applies): the profile if it belongs to the viewer, otherwise null.
   * Throws ProfilesError `permission_denied` for an anonymous viewer.
   */
  findOwn(userId: UserId): Promise<ProfileRecord | null>;
}
