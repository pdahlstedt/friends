import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../support/db';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  type DbClient,
  type TestUser,
} from '../support/roles';

// Spec 0001, AC13 and AC18: profiles.profiles access per role (plan, "RLS policies").
// anon: nothing. Own user: select only. Other user: nothing. Writes only via service_role.

const PERMISSION_DENIED = '42501';

const profiles = (client: DbClient) => client.schema('profiles').from('profiles');

type ProfileRow = { user_id: string; created_at: string; updated_at: string };

async function rowsFor(...userIds: string[]): Promise<ProfileRow[]> {
  const { data, error } = await profiles(serviceClient())
    .select('*')
    .in('user_id', userIds)
    .order('user_id');
  if (error) throw new Error(`service select failed: ${error.message}`);
  return data as ProfileRow[];
}

describe('[0001-AC13] profiles.profiles RLS', () => {
  let userA: TestUser;
  let userB: TestUser;
  let before: ProfileRow[];

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
    const { error } = await profiles(serviceClient()).insert([
      { user_id: userA.id },
      { user_id: userB.id },
    ]);
    if (error) throw new Error(`arrange failed: ${error.message}`);
    before = await rowsFor(userA.id, userB.id);
    expect(before).toHaveLength(2);
  });

  afterAll(async () => {
    // Deleting the auth user cascades to the profile row (ADR-0004 §5).
    await Promise.all([userA, userB].filter(Boolean).map(deleteTestUser));
    await closeDb();
  });

  describe('anon', () => {
    it('cannot select any profile', async () => {
      const { data, error } = await profiles(anonClient()).select('*');
      expect(data).toBeNull();
      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it('cannot insert, update or delete', async () => {
      const client = anonClient();
      const results = await Promise.all([
        profiles(client).insert({ user_id: userA.id }),
        profiles(client).update({ updated_at: new Date().toISOString() }).eq('user_id', userA.id),
        profiles(client).delete().eq('user_id', userA.id),
      ]);
      for (const { error } of results) expect(error?.code).toBe(PERMISSION_DENIED);
      expect(await rowsFor(userA.id, userB.id)).toEqual(before);
    });
  });

  describe('own user', () => {
    it('selects exactly their own row, even without a filter', async () => {
      const { data, error } = await profiles(userA.client).select('user_id');
      expect(error).toBeNull();
      expect(data).toEqual([{ user_id: userA.id }]);
    });

    it('cannot insert, update or delete their own row', async () => {
      const results = await Promise.all([
        profiles(userA.client).insert({ user_id: userA.id }),
        profiles(userA.client)
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', userA.id),
        profiles(userA.client).delete().eq('user_id', userA.id),
      ]);
      for (const { error } of results) expect(error?.code).toBe(PERMISSION_DENIED);
      expect(await rowsFor(userA.id, userB.id)).toEqual(before);
    });
  });

  describe('other user', () => {
    it("cannot select another user's row", async () => {
      const { data, error } = await profiles(userA.client).select('*').eq('user_id', userB.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("cannot insert, update or delete another user's row", async () => {
      const results = await Promise.all([
        profiles(userA.client).insert({ user_id: userB.id }),
        profiles(userA.client)
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', userB.id),
        profiles(userA.client).delete().eq('user_id', userB.id),
      ]);
      for (const { error } of results) expect(error?.code).toBe(PERMISSION_DENIED);
      expect(await rowsFor(userA.id, userB.id)).toEqual(before);
    });
  });

  describe('table setup', () => {
    it('forces RLS and has only the select-own policy', async () => {
      const [table] = await db()<{ forced: boolean }[]>`
        select relforcerowsecurity as forced from pg_class
        where oid = 'profiles.profiles'::regclass`;
      expect(table?.forced).toBe(true);

      const policies = await db()<{ name: string; cmd: string; roles: string[] }[]>`
        select policyname as name, cmd, roles from pg_policies
        where schemaname = 'profiles' and tablename = 'profiles'`;
      expect(policies).toEqual([
        { name: 'profiles_select_own', cmd: 'SELECT', roles: ['authenticated'] },
      ]);
    });

    it('deletes the profile when the auth user is deleted', async () => {
      const userC = await createTestUser();
      await profiles(serviceClient()).insert({ user_id: userC.id });
      expect(await rowsFor(userC.id)).toHaveLength(1);
      await deleteTestUser(userC);
      expect(await rowsFor(userC.id)).toEqual([]);
    });
  });
});
