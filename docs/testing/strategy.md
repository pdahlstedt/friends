# Test strategy

## Levels

| Level                 | Purpose                                                       | Tool                                | Runs against                                         | Location           | When in CI         |
| --------------------- | ------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- | ------------------ | ------------------ |
| **Unit**              | Domain logic, validation, every branch                        | Vitest                              | Fakes only, no I/O                                   | `src/**/*.test.ts` | Every push         |
| **Contract**          | Module public APIs and adapter interfaces behave as specified | Vitest                              | Fake **and** real (local Supabase, Stripe test mode) | `tests/contracts/` | Every PR           |
| **RLS**               | Database access is allowed/denied correctly per role          | Vitest + Supabase client            | Local Supabase                                       | `tests/rls/`       | Every PR           |
| **System regression** | Acceptance criteria end to end through the UI                 | Playwright                          | Full local stack                                     | `tests/system/`    | Every PR to `main` |
| **Security scans**    | Dependencies, code patterns, secrets                          | Dependabot, CodeQL, secret scanning | Repo                                                 | —                  | Every PR + weekly  |

## Unit tests — 100% coverage

Threshold: **100% statements, branches, functions, lines** on `src/modules/**` and `src/lib/**`. CI fails below it. The unit run also includes the contract suites wired to the in-memory fakes (`tests/contracts/**/*.fake.test.ts`), so every fake is held to the same contract as its real implementation.

Excluded from unit coverage (and covered elsewhere instead). The `real/` folders are listed in `coverage.exclude` in `vitest.config.ts`; `src/app`, `src/server` and `src/proxy.ts` are simply outside `coverage.include`:

| Excluded                                            | Why                                       | Covered by     |
| --------------------------------------------------- | ----------------------------------------- | -------------- |
| `src/lib/adapters/**/real/**` (vendor bindings)     | Only meaningful against the real service  | Contract tests |
| `src/modules/*/store/real/**` (ADR-0004)            | Only meaningful against the real database | Contract tests |
| `src/app/**` (Next.js pages/layouts wiring)         | Framework glue, little logic              | System tests   |
| `src/server/**` (composition root)                  | Wiring only, holds the real clients       | System tests   |
| `src/proxy.ts` (per-request nonce, session refresh) | Framework glue                            | System tests   |
| `**/*.d.ts`, generated DB types                     | No runtime code                           | Typecheck      |

Rules:

- Keep logic out of excluded areas: route handlers and pages call module APIs; adapters only translate to vendor SDKs.
- Test behaviour through the module's public API where possible; test internals only for hard-to-reach branches.
- `/* v8 ignore */` is forbidden except with a comment explaining why, approved in review.
- Mutation testing (Stryker) is recommended later on security-critical modules (users, billing, moderation) — 100% coverage proves lines ran, not that tests would catch a bug.

## Contract tests — interfaces

Each interface has one shared suite, run against every implementation:

```ts
// tests/contracts/object-storage.contract.ts
export function objectStorageContract(make: () => Promise<ObjectStorage>) {
  describe('ObjectStorage contract', () => {
    it('returns a signed URL only for existing objects', async () => {
      /* … */
    });
    it('rejects keys outside the caller namespace', async () => {
      /* … */
    });
  });
}

// tests/contracts/object-storage.fake.test.ts
objectStorageContract(async () => new InMemoryObjectStorage());

// tests/contracts/object-storage.supabase.test.ts
objectStorageContract(async () => createSupabaseObjectStorage(testClient));
```

Name the fake run `*.fake.test.ts`: `pnpm test` includes those files, so each in-memory fake gets its unit coverage from the same suite the real implementation must pass, with no stack needed. `pnpm test:contracts` runs both.

This guarantees fakes used in unit tests behave like the real thing, and makes vendor swaps safe. Module public APIs (`contract.ts`) get the same treatment — this is also what makes a later extraction to a service verifiable.

## RLS tests

For every table, a matrix of roles × operations (select/insert/update/delete), asserting both allowed and denied cases. Database functions get the same treatment for `execute`. Plus global catalog tests:

- **every table in every app schema has RLS enabled** (`tests/rls/rls-enabled.test.ts`);
- **every user column (`user_id`, `*_user_id`) cascades from `auth.users(id)`** (`tests/rls/user-foreign-keys.test.ts`, ADR-0006).

## Account deletion — residue scan

After a deletion, the real-wired `UsersApi` contract suite reads every table outside Postgres's system schemas (Supabase's `auth` included) as text and fails if any row still mentions the user's ID or email (`tests/support/residue.ts`, spec 0002 AC4). It catches new places where Supabase or a module keeps user data. It found `auth.flow_state` in 0002.

## System regression suite

- Every acceptance criterion tagged `@regression` in a spec has a Playwright test titled with the spec and AC ID, e.g. `[0003-AC1] user can upload avatar`.
- Journeys tagged `@responsive` (Playwright `tag`) also run in the phone (360 px) and tablet projects; everything runs in the desktop project.
- Every system test checks, at teardown, that none of its secrets reached the server log: emails, passwords, tokens, session cookies, JWTs and user IDs, collected from the browser's traffic (`tests/system/support/server-log.ts`).
- Suite runs headless against local Supabase (`supabase start`), seeded with deterministic test data, Stripe in test mode.
- Bugs that reached a user get a regression test before the fix.
- Flaky tests are fixed or quarantined within a day with an issue; never silently retried.

## Test data

- Deterministic seed in `supabase/seed.sql`; no production data in tests, ever.
- Factories in `tests/factories/` for unit and contract tests.
