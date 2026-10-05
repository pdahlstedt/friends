import type { UserId } from '@/lib/types/ids';
import { ProfilesError } from '../errors';
import type { ProfileRecord, ProfileStore } from './store';

// In-memory ProfileStore for unit tests. Mirrors Postgres + RLS: reads are scoped to the viewer,
// anonymous reads are denied, and inserts need an existing auth user (the FK to auth.users).

export type MemoryProfileDb = {
  /** Stand-in for auth.users. */
  readonly users: Set<UserId>;
  readonly rows: Map<UserId, ProfileRecord>;
  readonly now: () => Date;
};

export function createMemoryProfileDb(now: () => Date = () => new Date()): MemoryProfileDb {
  return { users: new Set(), rows: new Map(), now };
}

export function createMemoryProfileStore(db: MemoryProfileDb, viewer: UserId | null): ProfileStore {
  return {
    async insertIfMissing(userId) {
      if (!db.users.has(userId)) throw new ProfilesError('user_not_found');
      if (!db.rows.has(userId)) db.rows.set(userId, { userId, createdAt: db.now() });
    },

    async findOwn(userId) {
      if (viewer === null) throw new ProfilesError('permission_denied');
      const row = userId === viewer ? db.rows.get(userId) : undefined;
      // Copy, so callers can't mutate stored state (as with rows read from Postgres).
      return row ? { userId: row.userId, createdAt: new Date(row.createdAt) } : null;
    },
  };
}
