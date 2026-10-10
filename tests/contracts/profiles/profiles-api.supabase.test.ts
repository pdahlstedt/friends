import { randomUUID } from 'node:crypto';
import { toUserId, type UserId } from '@/lib/types/ids';
import { createProfilesApi, createSupabaseProfileStore } from '@/modules/profiles';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  type DbClient,
  type TestUser,
} from '../../support/roles';
import { profilesApiContract } from './profiles-api.contract';

// Wired the way the composition root will wire it: only through the module's index.ts.
profilesApiContract('real-wired', async () => {
  const users = new Map<UserId, TestUser>();
  const service = serviceClient();
  const anon = anonClient();

  const clientFor = (viewer: UserId | null): DbClient => {
    if (viewer === null) return anon;
    const user = users.get(viewer);
    if (!user) throw new Error('unknown test viewer');
    return user.client;
  };

  return {
    newUser: async () => {
      const user = await createTestUser();
      const id = toUserId(user.id);
      users.set(id, user);
      return id;
    },
    apiFor: (viewer) =>
      createProfilesApi({
        store: createSupabaseProfileStore({
          userClient: clientFor(viewer),
          serviceClient: service,
        }),
      }),
    unknownUserId: () => toUserId(randomUUID()),
    cleanup: async () => {
      await Promise.all([...users.values()].map(deleteTestUser));
    },
  };
});
