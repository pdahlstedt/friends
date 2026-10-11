import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../support/db';
import { SUPABASE_MANAGED_SCHEMAS } from '../support/schemas';

// Spec 0001, AC18: every table in every application schema has RLS enabled.
// Supabase-managed schemas are excluded; every other schema (including `public` and any
// schema added later) is checked automatically, so a new table without RLS fails CI.

type Row = { schema: string; table: string };

async function tablesWithoutRls(sql: ReturnType<typeof db>): Promise<Row[]> {
  return sql<Row[]>`
    select n.nspname as schema, c.relname as table
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and not c.relrowsecurity
      and n.nspname not like 'pg\_%'
      and n.nspname <> all(${SUPABASE_MANAGED_SCHEMAS})
    order by 1, 2
  `;
}

describe('[0001-AC18] RLS is enabled on every application table', () => {
  afterAll(closeDb);

  it('finds no application table with RLS disabled', async () => {
    expect(await tablesWithoutRls(db())).toEqual([]);
  });

  it('flags a table created without RLS (self-check, rolled back)', async () => {
    const rollback = new Error('rollback');
    let found: Row[] = [];
    await expect(
      db().begin(async (tx) => {
        await tx`create schema rls_selfcheck`;
        await tx`create table rls_selfcheck.no_rls (id int)`;
        await tx`create table rls_selfcheck.with_rls (id int)`;
        await tx`alter table rls_selfcheck.with_rls enable row level security`;
        found = await tablesWithoutRls(tx as unknown as ReturnType<typeof db>);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(found).toEqual([{ schema: 'rls_selfcheck', table: 'no_rls' }]);
  });
});
