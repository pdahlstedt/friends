import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserId } from '@/lib/types/ids';
import { ProfileStoreError, type ProfileStore } from '@/modules/profiles/store/store';

// Shared ProfileStore contract (spec 0001, AC11 and AC13). Runs against memory.ts and
// real/supabase.ts, so the fake used in unit tests behaves like Postgres + RLS.

export type ProfileStoreHarness = {
  /** Creates a new auth user (with no profile) and returns its ID. */
  newUser(): Promise<UserId>;
  /** A store whose user-scoped reads run as `viewer` (null = anonymous). */
  storeFor(viewer: UserId | null): ProfileStore;
  /** An ID that has no auth user. */
  unknownUserId(): UserId;
  cleanup(): Promise<void>;
};

async function expectStoreError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProfileStoreError);
  expect((error as ProfileStoreError).code).toBe(code);
}

export function profileStoreContract(
  name: string,
  makeHarness: () => Promise<ProfileStoreHarness>,
) {
  describe(`ProfileStore contract: ${name}`, () => {
    let h: ProfileStoreHarness;

    beforeAll(async () => {
      h = await makeHarness();
    });

    afterAll(async () => {
      await h?.cleanup();
    });

    it('findOwn returns null when the viewer has no profile yet', async () => {
      const user = await h.newUser();
      expect(await h.storeFor(user).findOwn(user)).toBeNull();
    });

    it('insertIfMissing creates a profile the owner can read', async () => {
      const user = await h.newUser();
      const store = h.storeFor(user);
      await store.insertIfMissing(user);

      const profile = await store.findOwn(user);
      expect(profile?.userId).toBe(user);
      expect(profile?.createdAt).toBeInstanceOf(Date);
      expect(Number.isNaN(profile?.createdAt.getTime())).toBe(false);
    });

    it('insertIfMissing is idempotent and never changes an existing profile', async () => {
      const user = await h.newUser();
      const store = h.storeFor(user);
      await store.insertIfMissing(user);
      const first = await store.findOwn(user);

      await store.insertIfMissing(user);
      expect(await store.findOwn(user)).toEqual(first);
    });

    it('concurrent insertIfMissing calls for one user all succeed', async () => {
      const user = await h.newUser();
      const store = h.storeFor(user);
      await Promise.all([1, 2, 3, 4, 5].map(() => store.insertIfMissing(user)));
      expect((await store.findOwn(user))?.userId).toBe(user);
    });

    it('insertIfMissing is privileged: it works without a signed-in viewer', async () => {
      const user = await h.newUser();
      await h.storeFor(null).insertIfMissing(user);
      expect((await h.storeFor(user).findOwn(user))?.userId).toBe(user);
    });

    it("[0001-AC13] findOwn returns null for another user's existing profile", async () => {
      const [viewer, other] = await Promise.all([h.newUser(), h.newUser()]);
      await h.storeFor(other).insertIfMissing(other);
      expect(await h.storeFor(viewer).findOwn(other)).toBeNull();
    });

    it('[0001-AC13] findOwn rejects an anonymous viewer with permission_denied', async () => {
      const user = await h.newUser();
      await h.storeFor(user).insertIfMissing(user);
      await expectStoreError(h.storeFor(null).findOwn(user), 'permission_denied');
    });

    it('insertIfMissing rejects a user ID with no auth user', async () => {
      await expectStoreError(h.storeFor(null).insertIfMissing(h.unknownUserId()), 'user_not_found');
    });
  });
}
