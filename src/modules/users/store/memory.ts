import type { UserId } from '@/lib/types/ids';
import { UsersError } from '../errors';
import type { UserAccountStore } from './store';

// In-memory UserAccountStore for unit tests. Mirrors what Supabase Auth keeps outside
// auth.users (audit-log entries, PKCE flow states) and users.erase_auth_leftovers: each row is
// about a user and may carry an email.

export type MemoryAuthLeftover = { action: string; userId: UserId; email?: string };

export type MemoryAuthLeftovers = {
  entries: MemoryAuthLeftover[];
  /** When true, every call fails as if the database were unreachable. */
  unavailable: boolean;
};

export function createMemoryAuthLeftovers(): MemoryAuthLeftovers {
  return { entries: [], unavailable: false };
}

export function createMemoryUserAccountStore(log: MemoryAuthLeftovers): UserAccountStore {
  return {
    async eraseAuthLeftovers(userId) {
      if (log.unavailable) throw new UsersError('unavailable');
      const emails = new Set(
        log.entries
          .filter((e) => e.userId === userId && e.email)
          .map((e) => e.email!.toLowerCase()),
      );
      log.entries = log.entries.filter(
        (e) => e.userId !== userId && !(e.email && emails.has(e.email.toLowerCase())),
      );
    },
  };
}
