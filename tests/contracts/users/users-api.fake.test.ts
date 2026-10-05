import { createFakeAuthBackend, createFakeAuthProvider } from '@/lib/adapters/auth/fake';
import { createFakeRateLimiter } from '@/lib/adapters/rate-limit/fake';
import type { UserId } from '@/lib/types/ids';
import { createProfilesApi } from '@/modules/profiles';
import { createMemoryProfileDb, createMemoryProfileStore } from '@/modules/profiles/store/memory';
import { createUsersApi } from '@/modules/users';
import { usersApiContract } from './users-api.contract';

usersApiContract('fake-wired', async () => {
  const backend = createFakeAuthBackend();
  const profileDb = createMemoryProfileDb();
  // The profile table's FK to auth users: point the memory store at the fake auth backend.
  const authUsers = { has: (id: UserId) => [...backend.users.values()].some((u) => u.id === id) };
  const db = { ...profileDb, users: authUsers as unknown as Set<UserId> };
  const limiter = createFakeRateLimiter();
  const instant = { now: () => 0, sleep: async () => {} };

  return {
    apiFor: (jar) =>
      createUsersApi({
        auth: createFakeAuthProvider(backend, { cookies: jar, secureCookies: true }),
        profiles: createProfilesApi({ store: createMemoryProfileStore(db, null) }),
        limiter,
        rateLimitSecret: 'f'.repeat(32),
        clock: instant,
      }),
    nextToken: async (email, alreadySeen) => {
      const sent = backend.sent.get(email.toLowerCase()) ?? [];
      if (sent.length <= alreadySeen) throw new Error('no new verification token');
      return sent.at(-1)!;
    },
    profileExists: async (userId) => profileDb.rows.has(userId),
    deleteProfile: async (userId) => {
      profileDb.rows.delete(userId);
    },
    cleanup: async () => {},
  };
});
