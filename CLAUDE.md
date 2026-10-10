# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Social media platform: users, profiles, chat, photo storage, simple ads, paid subscriptions, admin/moderation.
Start simple, grow over time. Low running costs. **Security is the top priority — never trade it for speed.**
Work is **spec-driven**: no feature code without an approved spec. See `docs/README.md`.

## Stack

- Next.js (App Router) + TypeScript (strict), single app — modular monolith
- Supabase: Postgres (EU region), Auth, Storage, Realtime
- Stripe Billing for subscriptions (Checkout + Customer Portal, webhooks)
- Cloudflare in front: DNS, WAF, rate limiting, Turnstile, Access for /admin
- Validation: Zod. Styling: Tailwind. Tests: Vitest + Playwright.
- Package manager: pnpm

## Where things live

- `docs/product/` — vision and story map (value-based breakdown)
- `docs/specs/NNNN-<slug>/` — one folder per feature slice: `spec.md`, `plan.md`, `tasks.md`
- `docs/adr/` — Architecture Decision Records (immutable once accepted; supersede, never edit)
- `docs/architecture/` — C4 diagrams (Mermaid) and module map; must match the code
- `docs/testing/strategy.md` — test levels, coverage rules, regression suite
- `src/modules/<name>/` — module code; `src/lib/adapters/` — vendor adapters
- `tests/contracts/`, `tests/system/`, `tests/rls/` — cross-module and system-level tests

## Spec-driven workflow (follow in order)

Use this repository's workflow only. Do not invoke GSD commands or workflows for this project.

1. **Spec** — copy `docs/specs/_template/` to `docs/specs/NNNN-<slug>/`. Fill `spec.md`: user value, acceptance criteria (Given/When/Then), security & privacy impact, out of scope. Status `Draft` → ask the user to approve → `Approved`.
2. **Plan** — fill `plan.md`: affected modules, public interface changes, data model + RLS, adapters, test plan per level. If a significant architectural choice is made, write an ADR first.
3. **Tasks** — break the plan into small tasks in `tasks.md`, each independently committable and testable.
4. **Implement** — test first where practical. One task ≈ one commit. Reference the spec ID in commits (`feat(profiles): add avatar upload [0003]`).
5. **Verify** — every acceptance criterion maps to at least one automated test (listed in `spec.md` traceability table). Update architecture docs if module boundaries or interfaces changed. Set spec status `Done`.

- Never implement behaviour that is not in an approved spec. If the spec is wrong or incomplete, stop and propose a spec change.
- Specs are value slices: each delivers something a user (or admin) can actually use, end to end. Do not slice by technical layer.

## Architecture rules

- Code is organised by module under `src/modules/<name>/`: users, profiles, chat, media, billing, ads, admin, moderation.
- A module exposes a public API via `src/modules/<name>/index.ts`, typed with interfaces in `src/modules/<name>/contract.ts`. Other modules import only from `index.ts` — never internals (enforced by ESLint boundaries rule).
- Each module owns its own tables (own Postgres schema where practical). No cross-module table access in SQL; go through the module API.
- Cross-cutting vendor integrations (auth, storage, Stripe, email, realtime, rate limiting) live behind adapters in `src/lib/adapters/<name>/`, each implementing an interface. Business logic never imports vendor SDKs directly.
- **Data access (ADR-0004):** all data access is server-side — the browser has no Supabase client or key. Each module has a store for its own tables in `src/modules/<m>/store/`: interface, in-memory fake in `store/memory.ts`, Supabase implementation in `store/real/`. Use the user-scoped client (RLS applies) by default; the service-role client only inside explicitly named privileged store methods, called after a server-side authorization check.
- `@supabase/*` may be imported only in `src/lib/adapters/*/real/**` and `src/modules/*/store/real/**` (ESLint `no-restricted-imports`). These `real/` folders are excluded from unit coverage and covered by contract tests instead.
- Dependency directions (ESLint `boundaries`, see `eslint.config.mjs`): `app` → `app`/`lib`/`server`/module `index.ts`; `server` → `server`/`lib`/`adapter`/module `index.ts`; module → own files/`lib`/`adapter`/other modules' `index.ts`; `lib` → `lib`/`adapter` only (never modules); an adapter → `lib`/itself. Files outside these elements cannot be imported from `src/`.
- The only cross-schema foreign key allowed is a module table → `auth.users(id) ON DELETE CASCADE`. DB types are generated into `src/lib/db/types.generated.ts` and used only by `store/real/` code.
- Rate limiting goes through the `RateLimiter` adapter (Postgres fixed window, `ratelimit` schema, HMAC'd keys — ADR-0005); declare rules via the policy helper in `src/lib/rate-limit/`.
- Every adapter and store has an in-memory fake implementing the same interface, used in unit tests.
- Code must stay portable: runnable in plain Node/Docker. No edge-only APIs in business logic.
- Do not introduce microservices, new infrastructure or new paid services without an ADR and the user's approval.

## Testing rules (CI enforces)

- **Unit tests: 100% statements, branches, functions and lines** for `src/modules/**` and `src/lib/**` (excluding adapter vendor bindings and generated types — see `docs/testing/strategy.md`). Coverage below threshold fails CI.
- Coverage is a floor, not the goal: test behaviour and edge cases, not implementation details. No assertion-free tests, no tests written only to touch lines.
- **Interface (contract) tests**: every module public API and every adapter interface has a contract test suite in `tests/contracts/`. The same suite runs against the fake and the real implementation (real = local Supabase / Stripe test mode).
- **RLS tests** in `tests/rls/`: for every table, verify allowed and denied access per role (anon, user, other user, moderator, admin).
- **System regression** in `tests/system/` (Playwright against the full local stack): every acceptance criterion tagged `@regression` in its spec gets an E2E test. The suite runs on every PR to `main` and must stay green.
- A bug fix starts with a failing test that reproduces it (at the lowest level that can catch it, plus a regression test if it was user-visible).
- Never disable, skip or weaken a test, coverage threshold, lint rule or type check to make CI pass. Ask instead.
- Integration tests get connection details from `tests/support/local-supabase.ts` (env vars in CI, otherwise `supabase status`). It refuses non-local hosts on purpose, because these tests create and delete users. Never bypass it.
- In RLS tests, assert access only through the role clients in `tests/support/roles.ts` (real JWTs via PostgREST). `serviceClient()` is only for arranging and cleaning up data, and the superuser `db()` in `tests/rls/support/db.ts` is only for catalog checks.
- Playwright uses `retries: 0`: fix or quarantine a flaky test, never retry it.

## Security rules (non-negotiable)

- **Row Level Security enabled on every table**, with explicit policies. A new table without RLS policies is a bug.
- The Supabase service-role key is server-only. Never import it in client components or anything prefixed `NEXT_PUBLIC_`.
- No secrets in code, logs, test fixtures or commits. Use env vars; keep `.env.example` updated with placeholder values only.
- Validate all input at the boundary with Zod (route handlers, server actions, webhooks). Never trust client-supplied user IDs — derive identity from the session.
- Authorization checks on the server for every mutation, even if RLS also covers it (defence in depth).
- Stripe webhooks: verify signatures, handle idempotently, never trust client-side payment state. Subscription status is read from our DB, synced from webhooks.
- Uploads: allowlist MIME types, verify magic bytes, enforce size limits, strip EXIF, randomise file names, serve from a separate domain/CDN. Private by default; use signed URLs.
- Rendering user content: no `dangerouslySetInnerHTML`. Sanitize any rich text.
- Keep strict security headers and CSP in `next.config` / middleware. Do not loosen them to make something work — ask instead.
- Admin actions require role check + are written to an audit log table.
- Rate-limit auth, uploads, chat messages and reports.
- New dependencies: prefer well-maintained, widely used packages; justify any new dependency in the PR description.

## Privacy / compliance (EU)

- GDPR: support account data export and full deletion (including storage objects and Stripe customer link).
- DSA: users can report content; moderation decisions are logged with reason.
- Minimise personal data. Do not log message contents, tokens or personal data.

## Git

- Trunk-based: `main` is always releasable. Short-lived branches `<type>/<spec-id>-<slug>` (e.g. `feat/0003-avatar-upload`), merged via PR with squash.
- Conventional Commits (`feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci`, `build`, `perf`, `security`), scope = module name, spec ID in brackets.
- Docs change in the same PR as the code they describe. Specs and ADRs go in their own `docs:` commits.
- Never commit generated secrets, `.env*` files (except `.env.example`), coverage output or build artefacts.
- Never force-push `main`, never rewrite published history.

## Language

- All documentation, code comments, commit messages and PR descriptions are in English.

## Commands

Node 24 (`.nvmrc`). The Supabase CLI is a devDependency — run it as `pnpm exec supabase …`.

- `pnpm dev` — run locally
- `pnpm lint` (ESLint + `prettier --check`, zero warnings) / `pnpm format` / `pnpm typecheck`
- `pnpm test` — unit tests (`src/**/*.test.ts`) with coverage (100% threshold)
- `pnpm test:contracts` — interface/contract tests against local stack (`vitest.contracts.config.ts`)
- `pnpm test:rls` — RLS policy tests against local Supabase (`vitest.rls.config.ts`)
- `pnpm test:system` — Playwright regression suite; runs `pnpm start`, so `pnpm build` first
- `pnpm verify` — everything CI runs, in CI order
- Single test: `pnpm exec vitest run path/to/file.test.ts -t "name"` (unit), add `--config vitest.rls.config.ts` or `--config vitest.contracts.config.ts` for those suites; `pnpm exec playwright test tests/system/x.spec.ts -g "name"`. Coverage thresholds only make sense on a full `pnpm test` run.
- `pnpm exec supabase start` — local Supabase stack; `pnpm exec supabase db reset` — reapply migrations + `supabase/seed.sql` (CI does this before integration tests)
- `pnpm exec supabase migration new <name>` — create migration
- `pnpm db:types` — regenerate `src/lib/db/types.generated.ts` from the local DB (add new module schemas to the script)
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` — local webhooks
- Slash commands: `/spec` (see `.claude/commands/spec.md` and `.github/prompts/spec.prompt.md`), `/plan`, `/implement`, `/verify` (see `.claude/commands/`)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
