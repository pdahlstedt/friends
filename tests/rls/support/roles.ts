import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { localSupabase } from '../../support/local-supabase';

// Role clients for RLS tests. Every request goes through PostgREST with a real JWT,
// exactly like production traffic, so policies and grants are tested together.
// Moderator and admin roles do not exist yet (spec 0001); they are added in Release 1.

export type TestUser = { id: string; client: SupabaseClient };

const noPersistence = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function anonClient(): SupabaseClient {
  const { apiUrl, anonKey } = localSupabase();
  return createClient(apiUrl, anonKey, noPersistence);
}

/** Bypasses RLS. Only for arranging and cleaning up test data — never for assertions about access. */
export function serviceClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = localSupabase();
  return createClient(apiUrl, serviceRoleKey, noPersistence);
}

/** Creates a confirmed user with a random email and password, signed in on its own client. */
export async function createTestUser(): Promise<TestUser> {
  const email = `rls-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');

  const { data: created, error: createError } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw new Error(`createUser failed: ${createError.message}`);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

  return { id: created.user.id, client };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  const { error } = await serviceClient().auth.admin.deleteUser(user.id);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}
