import { db } from './db';

// Spec 0002, AC4: after an account is deleted, no row anywhere in the database may still
// mention the user's ID or email. Every table in every non-system schema is read as text,
// Supabase's own schemas (auth, storage, …) included, so a new place that keeps user data
// fails the contract suite. Read-only, superuser; local and CI databases only.

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

/** A quoted SQL identifier. Names come from the catalog, never from input. */
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** "schema.table" of every table with a row mentioning `id` or `email` (case-insensitive). */
export async function tablesMentioning(id: string, email: string): Promise<string[]> {
  const tables = await db()<{ schema: string; table: string }[]>`
    select n.nspname as schema, c.relname as table
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname <> all(${SYSTEM_SCHEMAS})
      and n.nspname not like 'pg\\_temp%'
    order by 1, 2`;

  const found: string[] = [];
  for (const { schema, table } of tables) {
    const [row] = await db().unsafe<{ hit: boolean }[]>(
      `select exists (
         select 1 from ${ident(schema)}.${ident(table)} t
         where t::text ilike $1 or t::text ilike $2
       ) as hit`,
      [`%${id}%`, `%${email}%`],
    );
    if (row!.hit) found.push(`${schema}.${table}`);
  }
  return found;
}
