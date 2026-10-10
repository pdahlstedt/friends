import { randomInt, randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { SecretCollector, secretsInServerLog } from './server-log';

// Fixture callbacks are named `provide`, not Playwright's usual `use`, so React's hooks lint rule
// doesn't mistake them for React's use() hook.
// Per-test identity (ADR-0005): a unique email and a unique client IP (sent as X-Forwarded-For,
// the trusted header in the test server), so tests never share rate-limit buckets.
// Every test also checks, at teardown, that none of its secrets reached the server log (AC20).
export const test = base.extend<{
  email: string;
  clientIp: string;
  secrets: SecretCollector;
  serverLogHasNoSecrets: void;
}>({
  email: async ({}, provide) => {
    await provide(`system-${randomUUID()}@example.test`);
  },
  clientIp: async ({}, provide) => {
    await provide(`10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`);
  },
  secrets: async ({ email, context }, provide) => {
    await provide(new SecretCollector(email, context));
  },
  page: async ({ page, clientIp }, provide) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': clientIp });
    await provide(page);
  },
  serverLogHasNoSecrets: [
    async ({ secrets }, provide) => {
      await provide();
      await secrets.settled();
      expect(await secretsInServerLog(secrets.secrets), 'secrets found in the server log').toEqual(
        [],
      );
    },
    { auto: true },
  ],
});

export const PASSWORD = 'correct horse battery staple';

export { expect };
