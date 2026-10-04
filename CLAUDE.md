# CLAUDE.md

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
- Vendor-specific code (Supabase storage, Stripe, email, realtime) lives behind adapters in `src/lib/adapters/`, each implementing an interface. Business logic never imports vendor SDKs directly.
- Every adapter has an in-memory fake implementing the same interface, used in unit tests.
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

- `pnpm dev` — run locally
- `pnpm lint` / `pnpm typecheck`
- `pnpm test` — unit tests with coverage (100% threshold)
- `pnpm test:contracts` — interface/contract tests against local stack
- `pnpm test:rls` — RLS policy tests against local Supabase
- `pnpm test:system` — Playwright regression suite against full local stack
- `pnpm verify` — everything CI runs, in CI order
- `supabase start` — local Supabase stack
- `supabase migration new <name>` — create migration
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` — local webhooks
- Slash commands: `/spec`, `/plan`, `/implement`, `/verify` (see `.claude/commands/`)
