import { randomUUID } from 'node:crypto';
import { toUserId } from '@/lib/types/ids';
import { createProfilesApi } from '@/modules/profiles';
import { createMemoryProfileDb, createMemoryProfileStore } from '@/modules/profiles/store/memory';
import { profilesApiContract } from './profiles-api.contract';

profilesApiContract('fake-wired', async () => {
  const db = createMemoryProfileDb();
  return {
    newUser: async () => {
      const id = toUserId(randomUUID());
      db.users.add(id);
      return id;
    },
    apiFor: (viewer) => createProfilesApi({ store: createMemoryProfileStore(db, viewer) }),
    unknownUserId: () => toUserId(randomUUID()),
    cleanup: async () => {},
  };
});
