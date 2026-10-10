import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserId } from '@/lib/types/ids';
import type { UserAccountStore } from '@/modules/users/store/store';

// Shared UserAccountStore contract (spec 0002, AC4; ADR-0006). Runs against memory.ts and
// real/supabase.ts, so the fake used in unit tests erases exactly what Postgres does.

export type AccountRef = { id: UserId; email: string };

export type UserAccountStoreHarness = {
  store: UserAccountStore;
  /** An existing user with auth history (sign-up, log-in): audit entries and a flow state. */
  activeUser(): Promise<AccountRef>;
  /** A user with audit history who has been deleted (adding a user_deleted entry with the email). */
  deletedUser(): Promise<AccountRef>;
  /** Number of leftover rows (audit entries, flow states) that mention the user's ID or email. */
  entriesAbout(account: AccountRef): Promise<number>;
  unknownUserId(): UserId;
  cleanup(): Promise<void>;
};

export function userAccountStoreContract(
  name: string,
  makeHarness: () => Promise<UserAccountStoreHarness>,
) {
  describe(`UserAccountStore contract: ${name}`, () => {
    let h: UserAccountStoreHarness;

    beforeAll(async () => {
      h = await makeHarness();
    });

    afterAll(async () => {
      await h?.cleanup();
    });

    it('[0002-AC4] erases every leftover about a deleted user, by ID and by email', async () => {
      const gone = await h.deletedUser();
      expect(await h.entriesAbout(gone)).toBeGreaterThan(0);

      await h.store.eraseAuthLeftovers(gone.id);

      expect(await h.entriesAbout(gone)).toBe(0);
    });

    it('keeps the leftovers of other users', async () => {
      const other = await h.activeUser();
      const gone = await h.deletedUser();
      const before = await h.entriesAbout(other);
      expect(before).toBeGreaterThan(0);

      await h.store.eraseAuthLeftovers(gone.id);

      expect(await h.entriesAbout(other)).toBe(before);
    });

    it('[0002-AC12] is idempotent and accepts an ID with no entries', async () => {
      const gone = await h.deletedUser();
      await h.store.eraseAuthLeftovers(gone.id);
      await expect(h.store.eraseAuthLeftovers(gone.id)).resolves.toBeUndefined();
      await expect(h.store.eraseAuthLeftovers(h.unknownUserId())).resolves.toBeUndefined();
      expect(await h.entriesAbout(gone)).toBe(0);
    });
  });
}
