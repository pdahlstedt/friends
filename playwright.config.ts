import { defineConfig, devices } from '@playwright/test';

// System regression suite against the full local stack (docs/testing/strategy.md).
// Expects a production build (`pnpm build`); CI builds before running this.
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/system',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0, // flaky tests are fixed or quarantined, never silently retried
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Server log goes to logs/server.log: CI uploads it on failure, and the AC20 test (0001-T18)
    // scans it for personal data. Truncated on every run.
    command: 'mkdir -p logs && pnpm start > logs/server.log 2>&1',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
