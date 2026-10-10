import { randomUUID } from 'node:crypto';
import { toUserId } from '@/lib/types/ids';
import { createMemoryProfileDb, createMemoryProfileStore } from '@/modules/profiles/store/memory';
import { profileStoreContract } from './profile-store.contract';

profileStoreContract('memory', async () => {
  const db = createMemoryProfileDb();
  return {
    newUser: async () => {
      const id = toUserId(randomUUID());
      db.users.add(id);
      return id;
    },
    storeFor: (viewer) => createMemoryProfileStore(db, viewer),
    unknownUserId: () => toUserId(randomUUID()),
    cleanup: async () => {},
  };
});
