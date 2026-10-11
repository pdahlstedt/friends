// Schemas that Supabase manages. Catalog checks cover every other schema, so application
// schemas added later (and `public`) are included automatically.
export const SUPABASE_MANAGED_SCHEMAS = [
  'auth',
  'storage',
  'realtime',
  '_realtime',
  'extensions',
  'graphql',
  'graphql_public',
  'vault',
  'pgsodium',
  'pgsodium_masks',
  'net',
  'cron',
  'supabase_functions',
  'supabase_migrations',
  'pgbouncer',
  '_analytics',
  'information_schema',
];
