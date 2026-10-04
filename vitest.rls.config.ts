import { defineConfig } from 'vitest/config';
import path from 'node:path';

// RLS policy tests against local Supabase (docs/testing/strategy.md).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/rls/**/*.test.ts'],
    environment: 'node',
    // TODO(0001-T2): remove once the RLS harness and global RLS test exist.
    passWithNoTests: true,
  },
});
