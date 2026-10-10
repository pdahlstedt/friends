// Public API of the users module. Other code imports only from here (ESLint boundaries).

export type { FieldErrors, RequestContext, UsersApi } from './contract';

// For the composition root (src/server/container.ts) only: builds the per-request API.
export { createUsersApi, type UsersApiDeps } from './api';
export {
  createSupabaseUserAccountStore,
  type SupabaseUserAccountStoreClients,
} from './store/real/supabase';
