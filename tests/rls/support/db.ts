import postgres from 'postgres';
import { localSupabase } from '../../support/local-supabase';

// Direct Postgres connection (superuser) for catalog checks only. Access assertions
// must use the role clients in ./roles.ts so they go through PostgREST like real traffic.
let sql: postgres.Sql | undefined;

export function db(): postgres.Sql {
  sql ??= postgres(localSupabase().dbUrl, { max: 2, onnotice: () => {} });
  return sql;
}

export async function closeDb(): Promise<void> {
  await sql?.end();
  sql = undefined;
}
