import { describe, expect, it } from 'vitest';
import { toUserId } from '@/lib/types/ids';
import { UsersError } from '../errors';
import { createMemoryAuditLog, createMemoryUserAccountStore } from './memory';

// The behaviour shared with Postgres is in tests/contracts/users/user-account-store.contract.ts.
// Here: the fake's outage switch, which unit tests use to model a failed erase (spec 0002, AC12).

describe('memory UserAccountStore', () => {
  it('fails with UsersError "unavailable" and erases nothing while unavailable', async () => {
    const log = createMemoryAuditLog();
    const userId = toUserId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
    log.entries.push({ action: 'login', userId, email: 'a@example.test' });
    log.unavailable = true;

    const error = await createMemoryUserAccountStore(log)
      .eraseAuthAuditEntries(userId)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UsersError);
    expect(error).toMatchObject({ code: 'unavailable', message: 'Users error: unavailable' });
    expect(log.entries).toHaveLength(1);
  });
});
