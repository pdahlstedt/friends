import type { UserId } from '@/lib/types/ids';

// Public interface of the profiles module (spec 0001 plan). Other modules and the app depend
// only on this, via index.ts. Errors are thrown as ProfilesError (see errors.ts).

/** The signed-in user's own profile. Display name, bio and avatar arrive in Release 1. */
export type OwnProfile = { userId: UserId; createdAt: Date };

export interface ProfilesApi {
  /**
   * Privileged and idempotent: creates the profile if missing, never changes an existing one.
   * Called only by the users module, with a user ID it has verified server-side.
   */
  ensureProfile(userId: UserId): Promise<void>;

  /**
   * Reads as the signed-in user, so RLS applies: null unless `userId` is the viewer's own ID
   * and the profile exists. Throws `permission_denied` for an anonymous request.
   */
  getOwnProfile(userId: UserId): Promise<OwnProfile | null>;
}
