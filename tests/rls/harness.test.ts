import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from './support/roles';

// Sanity checks for the RLS harness itself: if these fail, every RLS result is meaningless.
describe('RLS harness role clients', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
  });

  afterAll(async () => {
    await Promise.all([userA, userB].filter(Boolean).map(deleteTestUser));
  });

  it('anon client has no authenticated user', async () => {
    const { data } = await anonClient().auth.getUser();
    expect(data.user).toBeNull();
  });

  it('each user client is authenticated as its own, distinct user', async () => {
    const [{ data: a }, { data: b }] = await Promise.all([
      userA.client.auth.getUser(),
      userB.client.auth.getUser(),
    ]);
    expect(a.user?.id).toBe(userA.id);
    expect(b.user?.id).toBe(userB.id);
    expect(userA.id).not.toBe(userB.id);
  });
});
