// Public API of the profiles module. Other code imports only from here (ESLint boundaries).

export type { OwnProfile, ProfilesApi } from './contract';
export { ProfilesError, type ProfilesErrorCode } from './errors';

// For the composition root (src/server/container.ts) only: builds the per-request API.
export { createProfilesApi, type ProfilesApiDeps } from './api';
export {
  createSupabaseProfileStore,
  type SupabaseProfileStoreClients,
} from './store/real/supabase';
