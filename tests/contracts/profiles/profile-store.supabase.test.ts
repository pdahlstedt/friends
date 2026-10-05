import { randomUUID } from 'node:crypto';
import { toUserId, type UserId } from '@/lib/types/ids';
import { createSupabaseProfileStore } from '@/modules/profiles/store/real/supabase';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  type DbClient,
  type TestUser,
} from '../../support/roles';
import { profileStoreContract } from './profile-store.contract';

// Real implementation against local Supabase: user-scoped reads with each user's own JWT,
// privileged writes with the service role.
profileStoreContract('supabase', async () => {
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
    storeFor: (viewer) =>
      createSupabaseProfileStore({ userClient: clientFor(viewer), serviceClient: service }),
    unknownUserId: () => toUserId(randomUUID()),
    // Deleting the auth user cascades to the profile (ADR-0004 §5).
    cleanup: async () => {
      await Promise.all([...users.values()].map(deleteTestUser));
    },
  };
});
