import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from '@playwright/test';
import { verificationTokens, waitForVerificationToken } from '../support/mailpit';
import { PASSWORD, expect, test } from './support/fixtures';

// Spec 0001: sign-up and email verification, end to end (AC1–AC5).

async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

test('[0001-AC1] a visitor signs up and is asked to check their email', async ({ page, email }) => {
  await signUp(page, email);

  await expect(page).toHaveURL('/signup/check-email');
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(await waitForVerificationToken(email)).toBeTruthy();
});

test('[0001-AC2] the emailed link confirms on button press and signs the user in', async ({
  page,
  browser,
  email,
}) => {
  await signUp(page, email);
  const link = `/auth/confirm?token_hash=${await waitForVerificationToken(email)}`;

  // An email link scanner opens the link first: a GET must not use up the token.
  const scanner = await browser.newPage();
  await scanner.goto(link);
  await expect(scanner.getByRole('button', { name: 'Confirm my email' })).toBeVisible();
  await scanner.close();

  await page.goto(link);
  const confirmPost = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/auth/confirm',
  );
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  // The response that sets the session cookies must never be cached by a CDN or proxy.
  expect((await confirmPost).headers()['cache-control']).toContain('no-store');
  await expect(page).toHaveURL('/me');

  const session = (await page.context().cookies()).filter((c) => c.name.startsWith('sb-'));
  expect(session.length).toBeGreaterThan(0);
});

test('[0001-AC3] malformed input shows field errors and creates nothing', async ({
  page,
  email,
}) => {
  await signUp(page, 'not-an-email', PASSWORD);
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

  await signUp(page, email, 'too short');
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible();
  await expect(page).toHaveURL('/signup');

  await sleep(1_000); // any email would have arrived by now
  expect(await verificationTokens(email)).toEqual([]);
});

test('[0001-AC4] signing up with an existing email looks exactly like a new sign-up', async ({
  page,
  email,
}) => {
  await signUp(page, email);
  await expect(page).toHaveURL('/signup/check-email');
  const firstPage = await page.locator('main').innerText();

  // Confirm the account, then try to sign up again with another password.
  await page.goto(`/auth/confirm?token_hash=${await waitForVerificationToken(email)}`);
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL('/me');
  await page.context().clearCookies();
  const emailsBefore = (await verificationTokens(email)).length;

  await signUp(page, email, 'another password entirely');
  await expect(page).toHaveURL('/signup/check-email');
  expect(await page.locator('main').innerText()).toBe(firstPage);
  await sleep(1_000);
  expect(await verificationTokens(email)).toHaveLength(emailsBefore);
});

test('[0001-AC5] a tampered link shows a generic error and offers a new link', async ({
  page,
  email,
}) => {
  await signUp(page, email);
  const token = await waitForVerificationToken(email);

  await page.goto(`/auth/confirm?token_hash=${token.slice(0, -4)}0000`);
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL('/auth/invalid-link');
  await expect(page.getByRole('heading', { name: 'Link invalid or expired' })).toBeVisible();
  expect((await page.context().cookies()).filter((c) => c.name.startsWith('sb-'))).toEqual([]);

  await sleep(1_100); // Supabase's per-account email interval (config.toml max_frequency)
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('status')).toContainText('we have sent it a new link');
  const fresh = await waitForVerificationToken(email, 1);

  await page.goto(`/auth/confirm?token_hash=${fresh}`);
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL('/me');
});

test('[0001-AC5] the confirm page without a token goes to the invalid-link page', async ({
  page,
}) => {
  await page.goto('/auth/confirm');
  await expect(page).toHaveURL('/auth/invalid-link');
});
