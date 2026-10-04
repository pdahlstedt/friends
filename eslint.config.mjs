import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';

// Architecture rules (CLAUDE.md, ADR-0002, ADR-0004):
// - modules import other modules only through their index.ts
// - src/lib never depends on modules or app code
// - vendor SDKs (@supabase/*) only in adapter and module-store real implementations
const sameModule = '{{from.element.captured.module}}';
const sameAdapter = '{{from.element.captured.adapter}}';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    'src/lib/db/types.generated.ts',
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/elements': [
        { type: 'adapter', pattern: 'src/lib/adapters/*', capture: ['adapter'] },
        { type: 'lib', pattern: 'src/lib' },
        { type: 'module', pattern: 'src/modules/*', capture: ['module'] },
        { type: 'app', pattern: 'src/app' },
        { type: 'server', pattern: 'src/server' },
      ],
    },
    rules: {
      // Nothing may import files outside the known elements (e.g. src/proxy.ts).
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            '{{from.element.type}} may not import {{to.element.type}} — see eslint.config.mjs',
          policies: [
            { allow: { to: { module: { origin: ['external', 'core'] } } } },
            {
              from: { element: { type: 'lib' } },
              allow: { to: { element: { types: ['lib', 'adapter'] } } },
            },
            {
              from: { element: { type: 'adapter' } },
              allow: [
                { to: { element: { type: 'lib' } } },
                { to: { element: { type: 'adapter', captured: { adapter: sameAdapter } } } },
              ],
            },
            {
              from: { element: { type: 'module' } },
              allow: [
                { to: { element: { types: ['lib', 'adapter'] } } },
                { to: { element: { type: 'module', captured: { module: sameModule } } } },
                { to: { element: { type: 'module', fileInternalPath: 'index.ts' } } },
              ],
            },
            {
              from: { element: { type: 'app' } },
              allow: [
                { to: { element: { types: ['app', 'lib', 'server'] } } },
                { to: { element: { type: 'module', fileInternalPath: 'index.ts' } } },
              ],
            },
            {
              from: { element: { type: 'server' } },
              allow: [
                { to: { element: { types: ['server', 'lib', 'adapter'] } } },
                { to: { element: { type: 'module', fileInternalPath: 'index.ts' } } },
              ],
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*'],
              message: 'Vendor SDKs are only allowed in */real/** implementations (ADR-0004).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/adapters/*/real/**', 'src/modules/*/store/real/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
