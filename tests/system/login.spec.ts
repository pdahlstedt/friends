import { setTimeout as sleep } from 'node:timers/promises';
import { waitForVerificationToken } from '../support/mailpit';
import { serviceClient } from '../support/roles';
import { PASSWORD, expect, test } from './support/fixtures';
import {
  accessTokenFrom,
  confirmFromEmail,
  confirmedAccount,
  logIn,
  sessionCookies,
  signUp,
} from './support/flows';

// Spec 0001: log in and log out, end to end (AC6–AC10, AC17).

const INCORRECT = 'Email or password is incorrect.';
const RATE_LIMITED = 'Too many attempts. Please try again later.';

test('[0001-AC6] a verified user logs in and lands on their profile page', async ({
  page,
  email,
}) => {
  await confirmedAccount(page, email);
  await logIn(page, email);
  await expect(page).toHaveURL('/me');
  expect(await sessionCookies(page)).not.toEqual([]);
});

test('[0001-AC7] an unknown email and a wrong password get the same message', async ({
  page,
  email,
}) => {
  await confirmedAccount(page, email);

  await logIn(page, email, 'not the right password');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(INCORRECT);
  const wrongPassword = await page.locator('main').innerText();

  await logIn(page, `unknown-${email}`, PASSWORD);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(INCORRECT);
  expect(await page.locator('main').innerText()).toBe(
    wrongPassword.replace(email, `unknown-${email}`),
  );
  await expect(page).toHaveURL('/login');
  expect(await sessionCookies(page)).toEqual([]);
});

test('[0001-AC8] an unverified user is told to verify and can get a new link', async ({
  page,
  email,
}) => {
  await signUp(page, email);
  await waitForVerificationToken(email);

  await logIn(page, email);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Please confirm your email first',
  );
  expect(await sessionCookies(page)).toEqual([]);

  await sleep(1_100); // Supabase's per-account email interval (config.toml max_frequency)
  await expect(page.getByLabel('Email').last()).toHaveValue(email);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('status')).toContainText('we have sent it a new link');
  await confirmFromEmail(page, email, 1);
});

test('[0001-AC9] after 5 attempts, even the right password is refused, without revealing the account', async ({
  page,
  email,
}) => {
  await confirmedAccount(page, email);
  for (let i = 0; i < 5; i++) {
    await logIn(page, email, `wrong password ${i}`);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(INCORRECT);
  }

  await logIn(page, email, PASSWORD);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(RATE_LIMITED);
  expect(await sessionCookies(page)).toEqual([]);

  // Same IP, an email with no account: the same answer.
  await logIn(page, `nobody-${email}`, PASSWORD);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(RATE_LIMITED);
});

test('[0001-AC10] logging out revokes the session server-side and clears the cookies', async ({
  page,
  email,
}) => {
  await confirmedAccount(page, email);
  await logIn(page, email);
  await expect(page).toHaveURL('/me');
  const accessToken = await accessTokenFrom(page);
  expect((await serviceClient().auth.getUser(accessToken)).data.user?.email).toBe(email);

  await page.goto('/logout');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');
  expect(await sessionCookies(page)).toEqual([]);

  // A copy of the session taken before logging out no longer works.
  const { data, error } = await serviceClient().auth.getUser(accessToken);
  expect(data.user).toBeNull();
  expect(error).not.toBeNull();
});

test('[0001-AC17] session cookies are HttpOnly, Secure, SameSite=Lax and host-only', async ({
  page,
  email,
}) => {
  await confirmedAccount(page, email);
  await logIn(page, email);
  await expect(page).toHaveURL('/me');

  const cookies = await sessionCookies(page);
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      domain: 'localhost', // no leading dot: host-only
    });
  }
});

test('log-out is POST only: visiting /logout does not end the session', async ({ page, email }) => {
  await confirmedAccount(page, email);
  await logIn(page, email);
  await expect(page).toHaveURL('/me');
  const before = await sessionCookies(page);

  await page.goto('/logout');
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  expect(await sessionCookies(page)).toEqual(before);
});
