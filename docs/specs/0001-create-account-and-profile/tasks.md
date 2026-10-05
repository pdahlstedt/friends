# 0001 — Tasks

Each task is small, independently committable, and leaves `main` green (`pnpm verify` passes).
Format: `- [ ] Tn — <description> (AC refs) — <commit type>(<scope>)`

## Foundation

- [x] T1 — Bootstrap the app: Next.js 16 (App Router), strict TypeScript, Tailwind, ESLint with the boundaries rule (module `index.ts` imports only; `@supabase/*` allowed only in `src/lib/adapters/**/real/**` and `src/modules/*/store/real/**`, per ADR-0004), Prettier, Vitest at the 100% threshold, a Playwright skeleton, `pnpm` scripts including `verify`. A placeholder landing page. (AC19) — build(app)
- [x] T2 — Local Supabase: `supabase init`; `config.toml` with email confirmations, `minimum_password_length = 12`, `jwt_expiry = 900`, the confirmation template linking to `/auth/confirm?token_hash=…`, and raised local `[auth.rate_limit]` values. RLS test harness (role clients for anon, user A, user B) plus a global "RLS enabled on every app table" test. (AC18) — test(rls)
- [x] T3 — CI: complete `.github/workflows/ci.yml` so it runs the full `pnpm verify` order against local Supabase, with env taken from `supabase status`, and uploads server logs and the Playwright report on failure. (AC19) — ci
- [x] T4 — `src/lib`: validated `env.ts` (server-only), `UserId` branded type, and a structured logger with allowlisted fields plus email/JWT redaction. Unit tests at 100%. (AC20) — feat(lib)
- [x] T5 — Security headers: a `lib/security/headers.ts` builder (nonce CSP, HSTS, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy; dev vs production) with unit tests. `src/proxy.ts` sets a per-request nonce. Playwright config with a `webServer` that captures the server log. A system test asserting the headers on every page. (AC16) — security(app)

## Profiles

- [x] T6 — Migration `profiles` schema and table with RLS and grants. RLS tests for select/insert/update/delete × anon, own user, other user. Generated DB types. (AC13) — feat(profiles)
- [x] T7 — `ProfileStore` interface, `memory.ts` fake, Supabase `real/` implementation (user-scoped read; service-role `insertIfMissing`), and a contract suite run against both. (AC11, AC13) — feat(profiles)
- [x] T8 — `ProfilesApi` (`contract.ts`, `index.ts`): `ensureProfile` (idempotent) and `getOwnProfile`. Unit tests at 100%, plus a module contract suite (fake-wired and real-wired). (AC11, AC13) — feat(profiles)

## Rate limiting (ADR-0005)

- [ ] T9 — Migration `ratelimit` schema, `buckets` table (RLS, no policies), `hit()` function (service_role only), and the `pg_cron` cleanup job. RLS tests showing anon and authenticated are denied on the table and the function. (AC9, AC18) — feat(lib)
- [ ] T10 — `RateLimiter` adapter: interface, in-memory fake with a clock, Postgres `real/` implementation. Contract suite covering the limit, window reset, `retryAfterSeconds` and concurrent hits. (AC9) — feat(adapters)
- [ ] T11 — `lib/rate-limit` keys (HMAC, email normalization) and a policy helper covering multiple dimensions; `lib/http/client-ip.ts` (trusted header, `unknown` fallback); `lib/security/timing.ts` (`withMinimumDuration`). Unit tests at 100%. (AC4, AC7, AC9) — feat(lib)

## Auth adapter and users module

- [ ] T12 — `AuthProvider` adapter: interface; fake with issued tokens; Supabase `real/` implementation on `@supabase/ssr` with hardened cookie options (`HttpOnly`, `SameSite=Lax`, `Secure` in production) and mapping of Supabase errors and 429s; a Mailpit test helper. Contract suite against the fake and local Supabase. Unit tests for cookie options. (AC1, AC2, AC4–AC8, AC10, AC17) — feat(adapters)
- [ ] T13 — `users`: strict Zod schemas (email; password of 12–72 UTF-8 bytes; unknown keys rejected); `signUp` and `resendVerification` with rate-limit checks first, enumeration-equal outcomes and minimum duration. Unit tests at 100%. (AC1, AC3, AC4, AC9, AC14) — feat(users)
- [ ] T14 — `users`: `confirmEmail`, `logIn`, `logOut`, `getCurrentUser`; `ensureProfile` after confirm and log-in. Unit tests at 100%. `UsersApi` module contract suite (fake-wired and real-wired). (AC2, AC5–AC8, AC10, AC14) — feat(users)

## UI and end to end

- [ ] T15 — Composition root `src/server/container.ts`. Pages and actions: `/signup`, `/signup/check-email`, `/auth/confirm` (GET shows the button, POST confirms), `/auth/invalid-link` with resend. Mobile-first, labelled forms. System tests `[0001-AC1]`, `[0001-AC2]`, AC3, AC4 and AC5. (AC1–AC5) — feat(users)
- [ ] T16 — `/login` (with "verify your email" plus resend for unconfirmed accounts) and POST `/logout`. System tests `[0001-AC6]`, `[0001-AC7]`, `[0001-AC10]`, AC8, AC9 (per-test `X-Forwarded-For`) and AC17 cookie flags. (AC6–AC10, AC17) — feat(users)
- [ ] T17 — `/me` own-profile page with empty state and a redirect for anonymous visitors. System tests `[0001-AC11]` and AC12. (AC11, AC12) — feat(profiles)
- [ ] T18 — Responsive and labelling checks: Playwright projects at 360 px, tablet and desktop running the full journey (no horizontal scroll; controls found by label and role) as `[0001-AC15]`. A system test scanning the captured server log for each test's email, password and tokens. (AC15, AC20) — test(system)

## Close-out

- [ ] T19 — **You:** create the GitHub repo, push `main`, enable branch protection (PR required, CI checks required, no force-push), and enable secret scanning, CodeQL and Dependabot. **Claude:** verify with `gh api` and record the result. (AC19) — chore
- [ ] T20 — Docs: CLAUDE.md adapter rule (ADR-0004 exception); architecture overview (container diagram without browser→Postgres; `AuthProvider` and `RateLimiter` in the adapters table; module APIs); `docs/testing/strategy.md` coverage exclusions (`src/modules/*/store/real/**`, `src/server/**`, `src/proxy.ts`); `.env.example`; spec traceability table; spec status set to Done. — docs
