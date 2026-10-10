import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types.generated';
import { localSupabase } from './local-supabase';

// Role clients for RLS and contract tests. Every request goes through PostgREST with a real JWT,
// exactly like production traffic, so policies and grants are tested together.
// Moderator and admin roles do not exist yet (spec 0001); they are added in Release 1.

// Typed with the generated schema, like the app's clients, so test queries are type-checked too.
export type DbClient = SupabaseClient<Database>;

export type TestUser = { id: string; client: DbClient };

const noPersistence = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function anonClient(): DbClient {
  const { apiUrl, anonKey } = localSupabase();
  return createClient<Database>(apiUrl, anonKey, noPersistence);
}

/** Bypasses RLS. Only for arranging and cleaning up test data — never for assertions about access. */
export function serviceClient(): DbClient {
  const { apiUrl, serviceRoleKey } = localSupabase();
  return createClient<Database>(apiUrl, serviceRoleKey, noPersistence);
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
