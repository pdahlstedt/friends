import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserId } from '@/lib/types/ids';
import { ProfilesError, type ProfilesApi } from '@/modules/profiles';

// ProfilesApi module contract (spec 0001, AC11 and AC13): the public API other modules and the
// app depend on. Runs fake-wired (memory store) and real-wired (local Supabase).

export type ProfilesApiHarness = {
  /** Creates a new auth user (with no profile) and returns its ID. */
  newUser(): Promise<UserId>;
  /** The API as wired for one request: signed in as `viewer`, or anonymous (null). */
  apiFor(viewer: UserId | null): ProfilesApi;
  /** An ID that has no auth user. */
  unknownUserId(): UserId;
  cleanup(): Promise<void>;
};

async function expectProfilesError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProfilesError);
  expect((error as ProfilesError).code).toBe(code);
}

export function profilesApiContract(name: string, makeHarness: () => Promise<ProfilesApiHarness>) {
  describe(`ProfilesApi contract: ${name}`, () => {
    let h: ProfilesApiHarness;

    beforeAll(async () => {
      h = await makeHarness();
    });

    afterAll(async () => {
      await h?.cleanup();
    });

    it('getOwnProfile returns null before ensureProfile has run', async () => {
      const user = await h.newUser();
      expect(await h.apiFor(user).getOwnProfile(user)).toBeNull();
    });

    it('[0001-AC11] ensureProfile creates the profile; the owner reads it with only id and createdAt', async () => {
      const user = await h.newUser();
      const api = h.apiFor(user);
      await api.ensureProfile(user);

      const profile = await api.getOwnProfile(user);
      expect(profile).not.toBeNull();
      // Empty state: nothing but identity and creation time exists yet (AC11).
      expect(Object.keys(profile!).sort()).toEqual(['createdAt', 'userId']);
      expect(profile!.userId).toBe(user);
      expect(profile!.createdAt).toBeInstanceOf(Date);
    });

    it('ensureProfile is idempotent', async () => {
      const user = await h.newUser();
      const api = h.apiFor(user);
      await api.ensureProfile(user);
      const first = await api.getOwnProfile(user);
      await api.ensureProfile(user);
      await Promise.all([api.ensureProfile(user), api.ensureProfile(user)]);
      expect(await api.getOwnProfile(user)).toEqual(first);
    });

    it('ensureProfile works on a request with no session yet (e.g. right after verification)', async () => {
      const user = await h.newUser();
      await h.apiFor(null).ensureProfile(user);
      expect((await h.apiFor(user).getOwnProfile(user))?.userId).toBe(user);
    });

    it("[0001-AC13] getOwnProfile never returns another user's profile", async () => {
      const [a, b] = await Promise.all([h.newUser(), h.newUser()]);
      await h.apiFor(b).ensureProfile(b);
      expect(await h.apiFor(a).getOwnProfile(b)).toBeNull();
    });

    it('[0001-AC12] getOwnProfile fails with permission_denied for an anonymous request', async () => {
      const user = await h.newUser();
      await h.apiFor(user).ensureProfile(user);
      await expectProfilesError(h.apiFor(null).getOwnProfile(user), 'permission_denied');
    });

    it('ensureProfile fails with user_not_found for an ID with no account', async () => {
      await expectProfilesError(h.apiFor(null).ensureProfile(h.unknownUserId()), 'user_not_found');
    });
  });
}
