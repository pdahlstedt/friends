import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Contract suites: each runs against the fake and the real implementation (docs/testing/strategy.md).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/contracts/**/*.test.ts'],
    environment: 'node',
    // TODO(0001-T7): remove once the first contract suite exists.
    passWithNoTests: true,
  },
});
