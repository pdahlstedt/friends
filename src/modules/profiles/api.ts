import type { OwnProfile, ProfilesApi } from './contract';
import type { ProfileStore } from './store/store';

export type ProfilesApiDeps = {
  /** Bound to the current request's viewer. */
  store: ProfileStore;
};

export function createProfilesApi({ store }: ProfilesApiDeps): ProfilesApi {
  return {
    ensureProfile: (userId) => store.insertIfMissing(userId),

    async getOwnProfile(userId) {
      const record = await store.findOwn(userId);
      if (!record) return null;
      // Explicit mapping: storage fields never leak into the public shape.
      const profile: OwnProfile = { userId: record.userId, createdAt: record.createdAt };
      return profile;
    },
  };
}
