import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests only. Contract, RLS and system tests have their own configs/scripts.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // TODO(0001-T4): remove once the first unit tests exist.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/lib/**'],
      exclude: [
        'src/lib/adapters/**/real/**', // covered by contract tests
        'src/modules/*/store/real/**', // covered by contract tests (ADR-0004)
        '**/*.d.ts',
        '**/*.test.ts',
        'src/lib/db/types.generated.ts',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
