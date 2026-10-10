import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authLeftoversAbout, createUserWithAuthHistory } from '../support/auth-history';
import { closeDb, db } from '../support/db';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  type DbClient,
  type TestUser,
} from '../support/roles';

// Spec 0002 / ADR-0006: the users schema's erase and sweep of Auth leftovers are server-only.
// anon and authenticated are denied; only service_role may call them.

const PERMISSION_DENIED = '42501';
const FUNCTIONS = ['users.erase_auth_leftovers(uuid)', 'users.sweep_auth_leftovers()'];

const erase = (client: DbClient, userId: string) =>
  client.schema('users').rpc('erase_auth_leftovers', { p_user_id: userId });
const sweep = (client: DbClient) => client.schema('users').rpc('sweep_auth_leftovers');

/** Audit entries that mention `userId` anywhere (actor or subject). Read-only check. */
async function auditEntriesAbout(userId: string): Promise<number> {
  const [row] = await db()<{ n: number }[]>`
    select count(*)::int as n from auth.audit_log_entries
    where payload::text like ${'%' + userId + '%'}`;
  return row!.n;
}

describe('[0002-AC4] users schema privileges and clean-up of Auth leftovers', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
    await closeDb();
  });

  for (const [role, client] of [
    ['anon', () => anonClient()],
    ['authenticated', () => user.client],
  ] as const) {
    describe(role, () => {
      it('cannot erase Auth leftovers, not even its own', async () => {
        const before = await auditEntriesAbout(user.id);
        expect(before).toBeGreaterThan(0);
        const { error } = await erase(client(), user.id);
        expect(error?.code).toBe(PERMISSION_DENIED);
        expect(await auditEntriesAbout(user.id)).toBe(before);
      });

      it('cannot run the sweep', async () => {
        const { error } = await sweep(client());
        expect(error?.code).toBe(PERMISSION_DENIED);
      });
    });
  }

  describe('service_role', () => {
    it('can call erase (idempotent for an unknown user) and the sweep', async () => {
      expect((await erase(serviceClient(), randomUUID())).error).toBeNull();
      expect((await sweep(serviceClient())).error).toBeNull();
    });

    it('the sweep removes leftovers about deleted users and keeps those of existing users', async () => {
      const kept = await createUserWithAuthHistory();
      const deleted = await createUserWithAuthHistory();
      const { error } = await serviceClient().auth.admin.deleteUser(deleted.id);
      if (error) throw new Error(`arrange failed: ${error.message}`);
      expect(await authLeftoversAbout(deleted)).toBeGreaterThan(0);
      const keptBefore = await authLeftoversAbout(kept);

      expect((await sweep(serviceClient())).error).toBeNull();

      expect(await authLeftoversAbout(deleted)).toBe(0);
      expect(await authLeftoversAbout(kept)).toBe(keptBefore);
      await serviceClient().auth.admin.deleteUser(kept.id);
    });
  });

  describe('catalog', () => {
    it('the users schema is usable only by service_role', async () => {
      const usage = await db()<{ role: string; can: boolean }[]>`
        select r as role, has_schema_privilege(r, 'users', 'usage') as can
        from unnest(array['anon', 'authenticated', 'service_role']) as r order by r`;
      expect(usage).toEqual([
        { role: 'anon', can: false },
        { role: 'authenticated', can: false },
        { role: 'service_role', can: true },
      ]);
    });

    for (const fn of FUNCTIONS) {
      it(`${fn} is SECURITY DEFINER with an empty search_path, executable only by service_role`, async () => {
        const [proc] = await db()<{ definer: boolean; config: string[] | null }[]>`
          select prosecdef as definer, proconfig as config from pg_proc
          where oid = ${fn}::regprocedure`;
        expect(proc).toEqual({ definer: true, config: ['search_path=""'] });

        const privileges = await db()<{ role: string; can: boolean }[]>`
          select r as role, has_function_privilege(r, ${fn}::regprocedure, 'execute') as can
          from unnest(array['anon', 'authenticated', 'service_role']) as r order by r`;
        expect(privileges).toEqual([
          { role: 'anon', can: false },
          { role: 'authenticated', can: false },
          { role: 'service_role', can: true },
        ]);

        const [acl] = await db()<{ public_execute: boolean }[]>`
          select exists (
            select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid = ${fn}::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
          ) as public_execute`;
        expect(acl!.public_execute).toBe(false);
      });
    }

    it('schedules the daily sweep', async () => {
      const jobs = await db()<{ schedule: string; command: string }[]>`
        select schedule, command from cron.job where jobname = 'users-sweep-auth-leftovers'`;
      expect(jobs).toEqual([
        { schedule: '17 3 * * *', command: 'select users.sweep_auth_leftovers()' },
      ]);
    });
  });
});
