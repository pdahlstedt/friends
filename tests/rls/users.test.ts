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

// Spec 0002 / ADR-0006: the users schema's audit-log erase and sweep are server-only.
// anon and authenticated are denied; only service_role may call them.

const PERMISSION_DENIED = '42501';
const FUNCTIONS = ['users.erase_auth_audit(uuid)', 'users.sweep_auth_audit()'];

const erase = (client: DbClient, userId: string) =>
  client.schema('users').rpc('erase_auth_audit', { p_user_id: userId });
const sweep = (client: DbClient) => client.schema('users').rpc('sweep_auth_audit');

/** Audit entries that mention `userId` anywhere (actor or subject). Read-only check. */
async function auditEntriesAbout(userId: string): Promise<number> {
  const [row] = await db()<{ n: number }[]>`
    select count(*)::int as n from auth.audit_log_entries
    where payload::text like ${'%' + userId + '%'}`;
  return row!.n;
}

describe('[0002-AC4] users schema privileges and audit-log clean-up', () => {
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
      it('cannot erase audit entries, not even its own', async () => {
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

    it('the sweep removes entries about deleted users and keeps those of existing users', async () => {
      const deleted = await createTestUser();
      await deleteTestUser(deleted); // adds a user_deleted entry carrying the email
      expect(await auditEntriesAbout(deleted.id)).toBeGreaterThan(0);
      const keptBefore = await auditEntriesAbout(user.id);

      expect((await sweep(serviceClient())).error).toBeNull();

      expect(await auditEntriesAbout(deleted.id)).toBe(0);
      expect(await auditEntriesAbout(user.id)).toBe(keptBefore);
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
        select schedule, command from cron.job where jobname = 'users-sweep-auth-audit'`;
      expect(jobs).toEqual([
        { schedule: '17 3 * * *', command: 'select users.sweep_auth_audit()' },
      ]);
    });
  });
});
