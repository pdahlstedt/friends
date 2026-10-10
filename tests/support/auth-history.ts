import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { db } from './db';
import { localSupabase } from './local-supabase';
import { serviceClient } from './roles';

// Users with the history the app gives them in Supabase Auth, for tests of what Auth keeps
// outside auth.users (spec 0002, ADR-0006): a PKCE sign-up (as @supabase/ssr does) leaves a
// flow_state row, and sign-up and log-in write audit-log entries carrying the email.

export type AccountRef = { id: string; email: string };

export async function createUserWithAuthHistory(): Promise<AccountRef> {
  const { apiUrl, anonKey } = localSupabase();
  const email = `history-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const client = () =>
    createClient(apiUrl, anonKey, {
      auth: { flowType: 'pkce', persistSession: false, autoRefreshToken: false },
    });

  const { data, error } = await client().auth.signUp({ email, password });
  if (error || !data.user) throw new Error(`signUp failed: ${error?.message}`);
  const id = data.user.id;
  const { error: confirmError } = await serviceClient().auth.admin.updateUserById(id, {
    email_confirm: true,
  });
  if (confirmError) throw new Error(`confirm failed: ${confirmError.message}`);
  const { error: signInError } = await client().auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
  return { id, email };
}

/** Rows Supabase Auth keeps outside auth.users that mention the user's ID or email. Read-only. */
export async function authLeftoversAbout({ id, email }: AccountRef): Promise<number> {
  const [row] = await db()<{ n: number }[]>`
    select
      (select count(*) from auth.flow_state where user_id = ${id}::uuid)
      + (select count(*) from auth.audit_log_entries
         where payload::text like ${'%' + id + '%'}
            or lower(payload::text) like ${'%' + email.toLowerCase() + '%'})
      as n`;
  return Number(row!.n);
}
