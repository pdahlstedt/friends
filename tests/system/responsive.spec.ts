import type { Page } from '@playwright/test';
import { PASSWORD, expect, test } from './support/fixtures';
import { confirmFromEmail, logIn, signUp } from './support/flows';

// Spec 0001 AC15 and spec 0002 AC13: the journeys work at phone (360 px), tablet and desktop
// widths. The phone and tablet projects in playwright.config.ts run only tests tagged @responsive.

/** No horizontal scroll, and every control fits the viewport width and has a label. */
async function expectUsable(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(clientWidth);

  const controls = page.locator(
    'input:not([type=hidden]), select, textarea, button, a[href], [role=button]',
  );
  const count = await controls.count();
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    expect(box.x, `control ${i} on ${page.url()} starts off-screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `control ${i} on ${page.url()} overflows`).toBeLessThanOrEqual(
      clientWidth,
    );
    const name = await control.evaluate((el) => {
      const labelled =
        el.getAttribute('aria-label') ??
        el.getAttribute('aria-labelledby') ??
        ('labels' in el
          ? [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent).join(' ')
          : '');
      return (labelled || (el instanceof HTMLInputElement ? '' : el.textContent) || '').trim();
    });
    expect(name, `control ${i} on ${page.url()} has no label`).not.toBe('');
  }
}

test(
  '[0001-AC15] sign-up, profile, log out and log in are usable at this viewport',
  { tag: '@responsive' },
  async ({ page, email }) => {
    await page.goto('/');
    await expectUsable(page);

    await page.goto('/signup');
    await expectUsable(page);
    await signUp(page, email);
    await expect(page).toHaveURL('/signup/check-email');
    await expectUsable(page);

    await confirmFromEmail(page, email);
    await expectUsable(page);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');
    await expectUsable(page);

    await logIn(page, email, 'not the right password');
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expectUsable(page);

    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL('/me');
    await expectUsable(page);

    await page.goto('/logout');
    await expectUsable(page);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');
  },
);

test(
  '[0002-AC13] profile, delete account and the deleted page are usable at this viewport',
  { tag: '@responsive' },
  async ({ page, email }) => {
    await signUp(page, email);
    await confirmFromEmail(page, email);
    await expectUsable(page);

    await page.getByRole('link', { name: 'Delete account' }).click();
    await expect(page).toHaveURL('/account/delete');
    await expectUsable(page);

    await page.getByLabel('Your password').fill('not the right password');
    await page.getByRole('button', { name: 'Delete my account permanently' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expectUsable(page);

    await page.getByLabel('Your password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Delete my account permanently' }).click();
    await expect(page).toHaveURL('/account/deleted');
    await expectUsable(page);
  },
);
