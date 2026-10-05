import { setTimeout as sleep } from 'node:timers/promises';
import { localSupabase } from './local-supabase';

// Reads verification emails that local Supabase Auth delivered to Mailpit (plan: "Mailer").
// Used by contract and system tests to get the token hash a real user would click.

type MessageSummary = { ID: string };

async function messageIds(email: string): Promise<string[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const response = await fetch(`${localSupabase().mailpitUrl}/api/v1/search?query=${query}`);
  if (!response.ok) throw new Error(`Mailpit search failed: ${response.status}`);
  const body = (await response.json()) as { messages: MessageSummary[] };
  return body.messages.map((m) => m.ID); // newest first
}

async function tokenHashIn(id: string): Promise<string> {
  const response = await fetch(`${localSupabase().mailpitUrl}/api/v1/message/${id}`);
  if (!response.ok) throw new Error(`Mailpit message failed: ${response.status}`);
  const { HTML } = (await response.json()) as { HTML: string };
  const match = /\/auth\/confirm\?token_hash=([^&"]+)/.exec(HTML);
  if (!match) throw new Error('No confirmation link in email');
  return match[1]!;
}

/** All verification token hashes sent to `email`, newest first. */
export async function verificationTokens(email: string): Promise<string[]> {
  return Promise.all((await messageIds(email)).map(tokenHashIn));
}

/** Waits until `email` has received more than `alreadySeen` emails, and returns the newest token. */
export async function waitForVerificationToken(
  email: string,
  alreadySeen = 0,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ids = await messageIds(email);
    if (ids.length > alreadySeen) return tokenHashIn(ids[0]!);
    await sleep(200);
  }
  throw new Error('Timed out waiting for a verification email');
}
