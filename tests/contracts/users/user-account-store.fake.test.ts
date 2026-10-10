import { randomUUID } from 'node:crypto';
import { toUserId } from '@/lib/types/ids';
import { createMemoryAuditLog, createMemoryUserAccountStore } from '@/modules/users/store/memory';
import { userAccountStoreContract, type AccountRef } from './user-account-store.contract';

userAccountStoreContract('memory', async () => {
  const log = createMemoryAuditLog();

  // The entries Supabase Auth writes: sign-up and log-in carry the email; so does user_deleted.
  const withHistory = (): AccountRef => {
    const account = { id: toUserId(randomUUID()), email: `store-${randomUUID()}@example.test` };
    log.entries.push(
      { action: 'user_signedup', userId: account.id, email: account.email },
      { action: 'login', userId: account.id, email: account.email },
      { action: 'token_refreshed', userId: account.id },
    );
    return account;
  };

  return {
    store: createMemoryUserAccountStore(log),
    activeUser: async () => withHistory(),
    deletedUser: async () => {
      const account = withHistory();
      // Written by the service role about the user: subject ID plus email, upper-cased here
      // to check that email matching ignores case.
      log.entries.push({
        action: 'user_deleted',
        userId: account.id,
        email: account.email.toUpperCase(),
      });
      return account;
    },
    entriesAbout: async ({ id, email }) =>
      log.entries.filter((e) => e.userId === id || e.email?.toLowerCase() === email).length,
    unknownUserId: () => toUserId(randomUUID()),
    cleanup: async () => {},
  };
});
