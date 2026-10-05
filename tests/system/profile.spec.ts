import { PASSWORD, expect, test } from './support/fixtures';
import { confirmFromEmail, confirmedAccount, logIn, signUp } from './support/flows';

// Spec 0001: own profile page, end to end (AC10–AC12).

test('[0001-AC11] a newly verified user sees their own empty profile', async ({ page, email }) => {
  await signUp(page, email);
  await confirmFromEmail(page, email);

  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  const profile = page.getByRole('region', { name: 'Profile' });
  await expect(profile.getByRole('img', { name: 'No profile picture yet' })).toBeVisible();
  await expect(profile).toContainText('No display name yet');
  await expect(profile).toContainText('No bio yet');
  await expect(profile).toContainText('Member since');
  // Only what the page needs: the email is not shown.
  await expect(page.getByRole('main')).not.toContainText(email);
});

test('[0001-AC12] a visitor who is not logged in is redirected to log in, with no profile data', async ({
  page,
  request,
}) => {
  const response = await request.get('/me', { maxRedirects: 0 });
  expect([303, 307, 308]).toContain(response.status());
  expect(response.headers()['location']).toMatch(/\/login$/);
  // No profile content (the static page title in <head> is not profile data).
  const body = await response.text();
  for (const profileContent of ['Member since', 'No display name yet', 'No bio yet']) {
    expect(body).not.toContain(profileContent);
  }

  await page.goto('/me');
  await expect(page).toHaveURL('/login');
});

test('[0001-AC10] after logging out, the profile page (also via back) redirects to log in', async ({
  page,
  email,
}) => {
  await confirmedAccount(page, email);
  await logIn(page, email, PASSWORD);
  await expect(page).toHaveURL('/me');

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');

  await page.goBack();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toHaveCount(0);

  await page.goto('/me');
  await expect(page).toHaveURL('/login');
});
