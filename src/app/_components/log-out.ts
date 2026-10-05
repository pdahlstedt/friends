'use server';

import { redirect } from 'next/navigation';
import { requestServices } from '@/server/container';

// POST only (a server action): a link or a GET can never log a user out, and Next.js checks the
// Origin of every action (CSRF). Revokes the session server-side and clears the cookies (AC10).
export async function logOutAction(): Promise<void> {
  const { users } = await requestServices();
  await users.logOut();
  redirect('/login');
}
