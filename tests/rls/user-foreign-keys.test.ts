import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../support/db';
import { SUPABASE_MANAGED_SCHEMAS } from '../support/schemas';

// ADR-0006 (spec 0002, AC4): deleting the auth user removes every module row about that user,
// in the same transaction. So every column that refers to a user (a uuid named `user_id` or
// `*_user_id`) in an application schema must have a foreign key to auth.users(id) with
// ON DELETE CASCADE. A new table that would keep data after deletion fails CI.

type Row = { schema: string; table: string; column: string };

async function userColumnsWithoutCascade(sql: ReturnType<typeof db>): Promise<Row[]> {
  return sql<Row[]>`
    select n.nspname as schema, c.relname as table, a.attname as column
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped
      and a.atttypid = 'uuid'::regtype
      and (a.attname = 'user_id' or a.attname like '%\\_user\\_id')
      and n.nspname not like 'pg\\_%'
      and n.nspname <> all(${SUPABASE_MANAGED_SCHEMAS})
      and not exists (
        select 1 from pg_constraint k
        where k.contype = 'f'
          and k.conrelid = c.oid
          and k.conkey = array[a.attnum]
          and k.confrelid = 'auth.users'::regclass
          and k.confkey = array[(select attnum from pg_attribute
                                 where attrelid = 'auth.users'::regclass and attname = 'id')]
          and k.confdeltype = 'c'
      )
    order by 1, 2, 3
  `;
}

describe('[0002-AC4] every user column cascades from auth.users (ADR-0006)', () => {
  afterAll(closeDb);

  it('finds no user column without ON DELETE CASCADE to auth.users(id)', async () => {
    expect(await userColumnsWithoutCascade(db())).toEqual([]);
  });

  it('includes profiles.profiles.user_id among the checked columns', async () => {
    const [row] = await db()<{ n: number }[]>`
      select count(*)::int as n from pg_constraint
      where conrelid = 'profiles.profiles'::regclass and contype = 'f'
        and confrelid = 'auth.users'::regclass and confdeltype = 'c'`;
    expect(row!.n).toBe(1);
  });

  it('flags user columns without the cascade (self-check, rolled back)', async () => {
    const rollback = new Error('rollback');
    let found: Row[] = [];
    await expect(
      db().begin(async (tx) => {
        await tx`create schema fk_selfcheck`;
        await tx`create table fk_selfcheck.no_fk (user_id uuid)`;
        await tx`create table fk_selfcheck.no_cascade (owner_user_id uuid references auth.users(id))`;
        await tx`create table fk_selfcheck.ok (user_id uuid references auth.users(id) on delete cascade)`;
        await tx`create table fk_selfcheck.not_a_user (user_identity uuid)`;
        found = await userColumnsWithoutCascade(tx as unknown as ReturnType<typeof db>);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(found).toEqual([
      { schema: 'fk_selfcheck', table: 'no_cascade', column: 'owner_user_id' },
      { schema: 'fk_selfcheck', table: 'no_fk', column: 'user_id' },
    ]);
  });
});
