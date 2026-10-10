import { randomUUID } from 'node:crypto';
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

// Spec 0001, AC9 and AC18 / ADR-0005: the rate-limit table and function are server-only.
// anon and authenticated are denied on both; only service_role may call ratelimit.hit().

const PERMISSION_DENIED = '42501';

const buckets = (client: DbClient) => client.schema('ratelimit').from('buckets');
const hit = (client: DbClient, key: string) =>
  client.schema('ratelimit').rpc('hit', { p_key: key, p_limit: 5, p_window_seconds: 60 });

async function bucketCount(key: string): Promise<number> {
  const [row] = await db()<{ n: number }[]>`
    select count(*)::int as n from ratelimit.buckets where key = ${key}`;
  return row!.n;
}

describe('[0001-AC18] ratelimit RLS and privileges', () => {
  let user: TestUser;
  const existingKey = `rls-test-${randomUUID()}`;

  beforeAll(async () => {
    user = await createTestUser();
    const { error } = await hit(serviceClient(), existingKey);
    if (error) throw new Error(`arrange failed: ${error.message}`);
  });

  afterAll(async () => {
    await db()`delete from ratelimit.buckets where key like 'rls-test-%'`;
    if (user) await deleteTestUser(user);
    await closeDb();
  });

  for (const [role, client] of [
    ['anon', () => anonClient()],
    ['authenticated', () => user.client],
  ] as const) {
    describe(role, () => {
      it('cannot select, insert, update or delete buckets', async () => {
        const c = client();
        const now = new Date().toISOString();
        const results = await Promise.all([
          buckets(c).select('*'),
          buckets(c).insert({
            key: `rls-test-${randomUUID()}`,
            window_start: now,
            count: 1,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
          buckets(c).update({ count: 1 }).eq('key', existingKey),
          buckets(c).delete().eq('key', existingKey),
        ]);
        for (const { error } of results) expect(error?.code).toBe(PERMISSION_DENIED);
        expect(await bucketCount(existingKey)).toBe(1);
      });

      it('cannot execute ratelimit.hit()', async () => {
        const key = `rls-test-${randomUUID()}`;
        const { data, error } = await hit(client(), key);
        expect(data).toBeNull();
        expect(error?.code).toBe(PERMISSION_DENIED);
        expect(await bucketCount(key)).toBe(0);
      });
    });
  }

  describe('service_role', () => {
    it('can execute ratelimit.hit()', async () => {
      const key = `rls-test-${randomUUID()}`;
      const { data, error } = await hit(serviceClient(), key);
      expect(error).toBeNull();
      expect(data).toEqual([{ allowed: true, retry_after_seconds: 0 }]);
      expect(await bucketCount(key)).toBe(1);
    });
  });

  describe('catalog', () => {
    it('buckets has RLS enabled and forced, with no policies', async () => {
      const [table] = await db()<{ enabled: boolean; forced: boolean }[]>`
        select relrowsecurity as enabled, relforcerowsecurity as forced
        from pg_class where oid = 'ratelimit.buckets'::regclass`;
      expect(table).toEqual({ enabled: true, forced: true });

      const [policies] = await db()<{ n: number }[]>`
        select count(*)::int as n from pg_policies where schemaname = 'ratelimit'`;
      expect(policies!.n).toBe(0);
    });

    it('hit() is SECURITY INVOKER with an empty search_path, executable only by service_role', async () => {
      const [fn] = await db()<{ definer: boolean; config: string[] | null }[]>`
        select prosecdef as definer, proconfig as config from pg_proc
        where oid = 'ratelimit.hit(text, integer, integer)'::regprocedure`;
      expect(fn).toEqual({ definer: false, config: ['search_path=""'] });

      const privileges = await db()<{ role: string; can: boolean }[]>`
        select r as role,
               has_function_privilege(r, 'ratelimit.hit(text, integer, integer)', 'execute') as can
        from unnest(array['anon', 'authenticated', 'service_role']) as r order by r`;
      expect(privileges).toEqual([
        { role: 'anon', can: false },
        { role: 'authenticated', can: false },
        { role: 'service_role', can: true },
      ]);

      // PUBLIC (every role) must not have EXECUTE via the function's ACL.
      const [acl] = await db()<{ public_execute: boolean }[]>`
        select exists (
          select 1 from pg_proc p, aclexplode(p.proacl) a
          where p.oid = 'ratelimit.hit(text, integer, integer)'::regprocedure
            and a.grantee = 0 and a.privilege_type = 'EXECUTE'
        ) as public_execute`;
      expect(acl!.public_execute).toBe(false);
    });

    it('schedules the hourly cleanup job', async () => {
      const jobs = await db()<{ schedule: string; command: string }[]>`
        select schedule, command from cron.job where jobname = 'ratelimit-cleanup'`;
      expect(jobs).toEqual([
        {
          schedule: '17 * * * *',
          command: 'delete from ratelimit.buckets where expires_at < now()',
        },
      ]);
    });
  });
});
