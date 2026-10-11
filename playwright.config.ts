import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { localSupabase } from './tests/support/local-supabase';

// System regression suite against the full local stack (docs/testing/strategy.md).
// Expects a production build (`pnpm build`); CI builds before running this.
const isCI = Boolean(process.env.CI);

// Its own port and server, never a reused `pnpm dev`: the server needs the env below.
const PORT = 3100;
const supabase = localSupabase(); // local stack only; refuses anything else

const serverEnv = {
  SUPABASE_URL: supabase.apiUrl,
  SUPABASE_ANON_KEY: supabase.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
  // Fresh per run, so rate-limit buckets from earlier runs never apply.
  RATE_LIMIT_KEY_SECRET: randomBytes(32).toString('hex'),
  // ADR-0005: tests send a unique X-Forwarded-For each, keeping real limits but isolating tests.
  TRUSTED_IP_HEADER: 'x-forwarded-for',
};

export default defineConfig({
  testDir: 'tests/system',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0, // flaky tests are fixed or quarantined, never silently retried
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 0001 AC15, 0002 AC13: journeys tagged @responsive also run at phone and tablet widths
    // (Chromium only, as in CI).
    {
      name: 'phone',
      grep: /@responsive/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet',
      grep: /@responsive/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Server log goes to logs/server.log: CI uploads it on failure, and the AC20 check
    // scans it for personal data (tests/system/support/server-log.ts). Truncated on every run.
    command: `mkdir -p logs && pnpm start --port ${PORT} > logs/server.log 2>&1`,
    url: `http://localhost:${PORT}`,
    env: serverEnv,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
