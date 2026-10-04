import { expect, test, type Response } from '@playwright/test';
import { NOT_FOUND_PAGE, PUBLIC_PAGES } from './support/pages';

// Spec 0001, AC16: every HTML response carries strict security headers with a nonce-based CSP.

function nonceOf(csp: string): string {
  const match = /'nonce-([^']+)'/.exec(csp);
  expect(match, 'CSP has a nonce').not.toBeNull();
  return match![1]!;
}

async function expectSecurityHeaders(response: Response | null) {
  expect(response).not.toBeNull();
  const headers = response!.headers();
  const csp = headers['content-security-policy'] ?? '';

  expect(headers['content-type']).toContain('text/html');
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'(;|$)/);
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(headers['strict-transport-security']).toMatch(/max-age=\d{8,}/);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['x-powered-by']).toBeUndefined();
  return csp;
}

for (const path of [...PUBLIC_PAGES, NOT_FOUND_PAGE]) {
  test(`[0001-AC16] ${path} carries strict security headers`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    // Also catches assets broken without a console message (e.g. ERR_BLOCKED_BY_CSP, or an https
    // upgrade failing on plain-http localhost). ERR_ABORTED is the Next router cancelling its own
    // duplicate <Link> prefetches, not a failure.
    const failed: string[] = [];
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText;
      if (reason !== 'net::ERR_ABORTED') failed.push(`${request.url()} ${reason}`);
    });

    const response = await page.goto(path);
    const csp = await expectSecurityHeaders(response);

    // Next.js applied the nonce to its own scripts, and nothing was blocked.
    const nonce = nonceOf(csp);
    const scriptNonces = await page
      .locator('script')
      .evaluateAll((scripts) => scripts.map((s) => (s as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    expect(scriptNonces.every((value) => value === nonce)).toBe(true);
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
    expect(failed).toEqual([]);
  });
}

test('[0001-AC16] the CSP nonce is fresh on every request', async ({ request }) => {
  const nonces = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const response = await request.get('/');
    nonces.add(nonceOf(response.headers()['content-security-policy'] ?? ''));
  }
  expect(nonces.size).toBe(3);
});
