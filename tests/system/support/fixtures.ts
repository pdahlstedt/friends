import { randomInt, randomUUID } from 'node:crypto';
import { test as base } from '@playwright/test';

// Fixture callbacks are named `provide`, not Playwright's usual `use`, so React's hooks lint rule
// doesn't mistake them for React's use() hook.
// Per-test identity (ADR-0005): a unique email and a unique client IP (sent as X-Forwarded-For,
// the trusted header in the test server), so tests never share rate-limit buckets.
export const test = base.extend<{ email: string; clientIp: string }>({
  email: async ({}, provide) => {
    await provide(`system-${randomUUID()}@example.test`);
  },
  clientIp: async ({}, provide) => {
    await provide(`10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`);
  },
  page: async ({ page, clientIp }, provide) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': clientIp });
    await provide(page);
  },
});

export { expect } from '@playwright/test';

export const PASSWORD = 'correct horse battery staple';
