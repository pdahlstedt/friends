import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { PASSWORD, expect, test } from './support/fixtures';
import { confirmFromEmail, logIn, signUp } from './support/flows';
import { SERVER_LOG, secretsInServerLog } from './support/server-log';

// Spec 0001, AC20. Every system test checks at teardown that none of its secrets reached the
// server log (support/fixtures.ts). This test runs every flow, failures included, and also proves
// that the check sees the secrets and that the server really does log these flows.

test('[0001-AC20] sign-up, verification, log-in and log-out leave no personal data in the log', async ({
  page,
  email,
  secrets,
}) => {
  await signUp(page, email, 'short'); // field errors
  await signUp(page, email);
  await signUp(page, email); // existing account
  await page.goto('/auth/confirm?token_hash=tampered-token-value');
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL('/auth/invalid-link');
  await logIn(page, email); // unverified
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await sleep(1_100); // Supabase's per-account email interval (config.toml max_frequency)
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await confirmFromEmail(page, email, 1);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');
  await logIn(page, email, 'a wrong password');
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await logIn(page, email);
  await expect(page).toHaveURL('/me');

  await secrets.settled();
  const collected = [...secrets.secrets];
  expect(collected).toContain(email);
  expect(collected).toContain(PASSWORD);
  expect(collected).toContain('a wrong password');
  expect(collected).toContain('tampered-token-value');
  expect(collected.filter((s) => /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(s)).length).toBeGreaterThan(0);

  const log = await readFile(SERVER_LOG, 'utf8');
  for (const event of ['users.sign_up', 'users.confirm_email', 'users.log_in', 'users.log_out']) {
    expect(log, `the server logs ${event}`).toContain(`"event":"${event}"`);
  }
  expect(await secretsInServerLog(collected)).toEqual([]);
});

test('[0002-AC14] account deletion, failures included, leaves no personal data or user ID in the log', async ({
  page,
  email,
  secrets,
}) => {
  await signUp(page, email);
  await confirmFromEmail(page, email);
  for (const password of ['a wrong password', PASSWORD]) {
    await page.goto('/account/delete');
    await page.getByLabel('Your password').fill(password);
    await page.getByRole('button', { name: 'Delete my account permanently' }).click();
  }
  await expect(page).toHaveURL('/account/deleted');

  await secrets.settled();
  const collected = [...secrets.secrets];
  expect(collected).toContain(email);
  expect(collected).toContain('a wrong password');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  expect(collected.filter((s) => uuid.test(s)).length).toBeGreaterThan(0);

  const log = await readFile(SERVER_LOG, 'utf8');
  for (const outcome of ['wrong_password', 'deleted']) {
    expect(log).toContain(`"event":"users.delete_account","outcome":"${outcome}"`);
  }
  expect(await secretsInServerLog(collected)).toEqual([]);
});
