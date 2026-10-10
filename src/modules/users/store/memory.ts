import type { UserId } from '@/lib/types/ids';
import { UsersError } from '../errors';
import type { UserAccountStore } from './store';

// In-memory UserAccountStore for unit tests. Mirrors auth.audit_log_entries and
// users.erase_auth_audit: entries are about a user as actor or subject and may carry an email.

export type MemoryAuditEntry = { action: string; userId: UserId; email?: string };

export type MemoryAuditLog = {
  entries: MemoryAuditEntry[];
  /** When true, every call fails as if the database were unreachable. */
  unavailable: boolean;
};

export function createMemoryAuditLog(): MemoryAuditLog {
  return { entries: [], unavailable: false };
}

export function createMemoryUserAccountStore(log: MemoryAuditLog): UserAccountStore {
  return {
    async eraseAuthAuditEntries(userId) {
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
