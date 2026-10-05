import type { Page } from '@playwright/test';
import { waitForVerificationToken } from '../../support/mailpit';
import { PASSWORD, expect } from './fixtures';

// User journeys shared by system tests. Controls are found by label and role (AC15).

export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/** Opens the newest emailed link and presses the confirm button; ends signed in on /me. */
export async function confirmFromEmail(page: Page, email: string, alreadySeen = 0) {
  await page.goto(`/auth/confirm?token_hash=${await waitForVerificationToken(email, alreadySeen)}`);
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL('/me');
}

/** A confirmed account, signed out again (cookies cleared). */
export async function confirmedAccount(page: Page, email: string, password = PASSWORD) {
  await signUp(page, email, password);
  await expect(page).toHaveURL('/signup/check-email');
  await confirmFromEmail(page, email);
  await page.context().clearCookies();
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** The Supabase session cookies in this browser. */
export async function sessionCookies(page: Page) {
  return (await page.context().cookies()).filter((c) => c.name.startsWith('sb-'));
}

/** The access token inside the session cookie (`base64-` + JSON, possibly chunked). */
export async function accessTokenFrom(page: Page): Promise<string> {
  const chunks = (await sessionCookies(page))
    .filter((c) => /-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const raw = chunks.map((c) => c.value).join('');
  const json = Buffer.from(raw.replace(/^base64-/, ''), 'base64url').toString('utf8');
  return (JSON.parse(json) as { access_token: string }).access_token;
}
