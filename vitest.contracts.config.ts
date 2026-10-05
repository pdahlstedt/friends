import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Contract suites: each runs against the fake and the real implementation (docs/testing/strategy.md).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/contracts/**/*.test.ts'],
    environment: 'node',
    // Real implementations run in real time (e.g. 800 ms minimum-duration padding per call).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
