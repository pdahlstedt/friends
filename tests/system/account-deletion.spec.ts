import type { Page } from '@playwright/test';
import { PASSWORD, expect, test } from './support/fixtures';
import {
  accessTokenFrom,
  confirmFromEmail,
  confirmedAccount,
  logIn,
  sessionCookies,
  signUp,
} from './support/flows';

// Spec 0002: delete my account, end to end (AC1–AC3, AC5–AC11).

const INCORRECT_LOGIN = 'Email or password is incorrect.';
const RATE_LIMITED = 'Too many attempts. Please try again later.';

/** A confirmed account, logged in on `page`. */
async function loggedIn(page: Page, email: string) {
  await confirmedAccount(page, email);
  await logIn(page, email);
  await expect(page).toHaveURL('/me');
}

async function submitDelete(page: Page, password: string) {
  await page.goto('/account/delete');
  await page.getByLabel('Your password').fill(password);
  await page.getByRole('button', { name: 'Delete my account permanently' }).click();
}

/** The user ID inside the session's access token (the JWT `sub`). */
async function userIdOf(page: Page): Promise<string> {
  const token = await accessTokenFrom(page);
  return (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string })
    .sub;
}

/** The account still works: its profile page opens. */
async function expectStillLoggedIn(page: Page) {
  await page.goto('/me');
  await expect(page).toHaveURL('/me');
}

test('[0002-AC1] the profile page leads to a page that explains deletion before anything happens', async ({
  page,
  email,
}) => {
  await loggedIn(page, email);

  await page.getByRole('link', { name: 'Delete account' }).click();
  await expect(page).toHaveURL('/account/delete');
  await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible();
  const explanation = page.getByRole('region', { name: 'What will be deleted' });
  await expect(explanation).toContainText('immediately');
  await expect(explanation).toContainText('your account and your email address');
  await expect(explanation).toContainText('your profile');
  await expect(explanation).toContainText('This cannot be undone.');

  // Opening the page deleted nothing.
  await expectStillLoggedIn(page);
});

test('[0002-AC2] confirming with the password deletes the account and logs out', async ({
  page,
  email,
}) => {
  await loggedIn(page, email);

  const deletePost = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/account/delete',
  );
  await submitDelete(page, PASSWORD);
  // The response that clears the session cookies must never be cached.
  expect((await deletePost).headers()['cache-control']).toContain('no-store');
  await expect(page).toHaveURL('/account/deleted');
  await expect(page.getByRole('heading', { name: 'Your account has been deleted' })).toBeVisible();
  expect(await sessionCookies(page)).toEqual([]);

  await page.goto('/me');
  await expect(page).toHaveURL('/login');
});

test('[0002-AC3] after deletion, the old credentials get the same message as an unknown email', async ({
  page,
  email,
}) => {
  await loggedIn(page, email);
  await submitDelete(page, PASSWORD);
  await expect(page).toHaveURL('/account/deleted');

  await logIn(page, email);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(INCORRECT_LOGIN);
  expect(await sessionCookies(page)).toEqual([]);
});

test('[0002-AC5] the same email can sign up again, as a new and empty account', async ({
  page,
  email,
}) => {
  await loggedIn(page, email);
  const oldId = await userIdOf(page);
  await submitDelete(page, PASSWORD);
  await expect(page).toHaveURL('/account/deleted');

  await signUp(page, email, 'a brand new password');
  await expect(page).toHaveURL('/signup/check-email');
  await confirmFromEmail(page, email, 1); // the first email belonged to the deleted account
  await expect(page.getByRole('region', { name: 'Profile' })).toContainText('No display name yet');
  expect(await userIdOf(page)).not.toBe(oldId);
});

test('[0002-AC6] a wrong password deletes nothing and keeps the user logged in', async ({
  page,
  email,
}) => {
  await loggedIn(page, email);
  await submitDelete(page, 'not the right password');

  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Password is incorrect.');
  await expect(page).toHaveURL('/account/delete');
  await expectStillLoggedIn(page);
});

test('[0002-AC7] after 5 attempts, even the right password is refused and nothing is deleted', async ({
  page,
  email,
}) => {
  await loggedIn(page, email);
  for (let i = 0; i < 5; i++) {
    await submitDelete(page, `wrong password ${i}`);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Password is incorrect.');
  }

  await submitDelete(page, PASSWORD);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(RATE_LIMITED);
  await expectStillLoggedIn(page);
});

test('[0002-AC8] without a session the page redirects to log in, and so does the action', async ({
  page,
  request,
  email,
}) => {
  const response = await request.get('/account/delete', { maxRedirects: 0 });
  expect([303, 307, 308]).toContain(response.status());
  expect(response.headers()['location']).toMatch(/\/login$/);

  // The session ends while the form is open (e.g. logged out in another tab).
  await loggedIn(page, email);
  await page.goto('/account/delete');
  await page.context().clearCookies();
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Delete my account permanently' }).click();
  await expect(page).toHaveURL('/login');

  // The account was not deleted.
  await logIn(page, email);
  await expect(page).toHaveURL('/me');
});

test('[0002-AC9] fields naming another user are ignored: only the session user is deleted', async ({
  page,
  browser,
  email,
  clientIp,
}) => {
  const victimContext = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': `${clientIp.slice(0, -1)}9` },
  });
  const victim = await victimContext.newPage();
  const victimEmail = `victim-${email}`;
  await loggedIn(victim, victimEmail);
  const victimId = await userIdOf(victim);

  await loggedIn(page, email);
  await page.goto('/account/delete');
  // A crafted form: extra fields naming the victim.
  await page.locator('form').evaluate(
    (form, values) => {
      for (const [name, value] of Object.entries(values)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
    },
    { userId: victimId, user_id: victimId, email: victimEmail },
  );
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Delete my account permanently' }).click();
  await expect(page).toHaveURL('/account/deleted');

  // The attacker's own account is gone; the victim's is untouched.
  await logIn(page, email);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(INCORRECT_LOGIN);
  await expectStillLoggedIn(victim);
  await victimContext.close();
});

test('[0002-AC10] opening the page deletes nothing, and a cross-site POST is rejected', async ({
  page,
  email,
  clientIp,
  baseURL,
}) => {
  await loggedIn(page, email);
  for (let i = 0; i < 3; i++) await page.goto('/account/delete'); // e.g. a link scanner
  await expectStillLoggedIn(page);

  // Replay the real form submission, with the browser's cookies, from another origin.
  await page.goto('/account/delete');
  await page.getByLabel('Your password').fill(PASSWORD);
  const fields = await page
    .locator('form')
    .evaluate((form) => [...new FormData(form as HTMLFormElement)] as [string, string][]);
  const post = (origin: string) =>
    page.request.post('/account/delete', {
      multipart: Object.fromEntries(fields),
      headers: { origin, 'x-forwarded-for': clientIp },
      maxRedirects: 0,
    });

  const forged = await post('https://evil.example');
  expect(forged.status()).toBeGreaterThanOrEqual(400);
  await expectStillLoggedIn(page);

  // Control: the same request from our own origin is accepted, so the forged one was valid
  // apart from its origin.
  const genuine = await post(baseURL!);
  expect(genuine.status()).toBe(303);
  expect(genuine.headers()['location']).toContain('/account/deleted');
  await page.goto('/me');
  await expect(page).toHaveURL('/login');
});

test('[0002-AC11] the session on another device stops working right away', async ({
  page,
  browser,
  email,
  clientIp,
}) => {
  await loggedIn(page, email);
  const otherDevice = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': clientIp },
  });
  const other = await otherDevice.newPage();
  await logIn(other, email);
  await expect(other).toHaveURL('/me');

  await submitDelete(page, PASSWORD);
  await expect(page).toHaveURL('/account/deleted');

  await other.goto('/me');
  await expect(other).toHaveURL('/login');
  await otherDevice.close();
});
