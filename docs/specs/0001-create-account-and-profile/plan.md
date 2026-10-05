# 0001 — Plan

Depends on: [ADR-0004 Module data access](../../adr/0004-module-data-access.md) and [ADR-0005 Application rate limiting](../../adr/0005-application-rate-limiting.md), both Accepted.

## Approach

This is a greenfield bootstrap plus the first value slice.

- **App:** a Next.js 16 app (App Router, strict TypeScript, Tailwind) with server-rendered pages and server actions. The browser holds no Supabase client and no Supabase key (ADR-0004).
- **Auth:** Supabase Auth with email and password and confirmation enabled, reached only through an `AuthProvider` adapter. Sessions live in `HttpOnly` cookies managed by `@supabase/ssr` on the server.
- **Email verification:** the token-hash flow (`verifyOtp` with the emailed `token_hash`), so the link works on any device. `@supabase/ssr` always runs the PKCE flow and sets a code-verifier cookie at sign-up, but `verifyOtp` does not need it; the contract suite verifies the link from a different browser. The emailed link points to `/auth/confirm?token_hash=…`. The page shows a **"Confirm my email"** button, and the button POSTs the token, which then verifies the email and logs the user in. A plain GET never consumes the token, so email link scanners can't use it up (AC2 as amended).
- **Profile:** a profile record is created idempotently by `profiles.ensureProfile` after a successful verification or login. The user cannot write it directly.
- **Proxy:** `src/proxy.ts` (Next.js 16 proxy, Node runtime) refreshes the session and sets per-request nonce-based security headers.
- **CI:** the existing `.github/workflows/ci.yml` is completed so it runs the full `pnpm verify` chain against local Supabase.

## Modules and interfaces

No `contract.ts` exists yet; all of the following are new.

| Module    | Change                                                                                                                                                                            | Public interface change (`contract.ts`)                                                                                                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users     | New. Account flows that orchestrate `AuthProvider`, `RateLimiter` and `profiles`. Owns the Zod input schemas. No tables of its own in 0001 (`auth.users` is managed by Supabase). | `UsersApi` — see below                                                                                                                                                                                                                                                                                         |
| profiles  | New. `profiles` schema and store.                                                                                                                                                 | `ProfilesApi` — see below                                                                                                                                                                                                                                                                                      |
| `src/lib` | Shared, non-module code.                                                                                                                                                          | `UserId` branded type (`lib/types/ids.ts`); logger (`lib/log`); security headers and CSP (`lib/security/headers.ts`); minimum-duration helper (`lib/security/timing.ts`); client IP extraction (`lib/http/client-ip.ts`); rate-limit policy and keys (`lib/rate-limit/`); validated environment (`lib/env.ts`) |

```ts
// src/modules/users/contract.ts
export type RequestContext = { clientIp: string | null }; // derived server-side only
export type FieldErrors = Partial<Record<'email' | 'password', string>>;

export interface UsersApi {
  // Every input is `unknown` and is validated inside with Zod. None takes a user ID.
  signUp(
    input: unknown,
    ctx: RequestContext,
  ): Promise<
    | { kind: 'check_email' }
    | { kind: 'invalid'; fieldErrors: FieldErrors }
    | { kind: 'rate_limited' }
  >;
  confirmEmail(
    input: unknown /* { tokenHash } */,
  ): Promise<{ kind: 'confirmed' } | { kind: 'invalid_link' } | { kind: 'rate_limited' }>;
  logIn(
    input: unknown,
    ctx: RequestContext,
  ): Promise<
    | { kind: 'logged_in' }
    | { kind: 'invalid_credentials' }
    | { kind: 'email_not_confirmed' }
    | { kind: 'invalid'; fieldErrors: FieldErrors }
    | { kind: 'rate_limited' }
  >;
  resendVerification(
    input: unknown,
    ctx: RequestContext,
  ): Promise<
    | { kind: 'sent_if_applicable' }
    | { kind: 'invalid'; fieldErrors: FieldErrors }
    | { kind: 'rate_limited' }
  >;
  logOut(): Promise<void>;
  getCurrentUser(): Promise<{ id: UserId } | null>; // server-verified (auth.getUser), never decoded locally
}

// src/modules/profiles/contract.ts
export type OwnProfile = { userId: UserId; createdAt: Date };
export interface ProfilesApi {
  ensureProfile(userId: UserId): Promise<void>; // privileged, idempotent; called by users only
  getOwnProfile(userId: UserId): Promise<OwnProfile | null>; // user-scoped client, so RLS applies
}
```

- **Dependency direction:** `users → profiles`, which matches the overview diagram. The App layer (`src/app`) composes the two APIs. The user ID always comes from `users.getCurrentUser()` (AC14).
- **Composition root:** `src/server/container.ts` builds the per-request APIs with the real adapters. It contains no logic, and system tests cover it.

### Routes (`src/app`, logic-free wiring)

| Route                 | Kind                                               | Calls                                                                                            |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/signup`             | page + server action                               | `users.signUp` → redirect `/signup/check-email`                                                  |
| `/signup/check-email` | page                                               | —                                                                                                |
| `/auth/confirm`       | page (GET shows the button) + server action (POST) | `users.confirmEmail` → `/me`, or → `/auth/invalid-link`                                          |
| `/auth/invalid-link`  | page + resend action                               | `users.resendVerification`                                                                       |
| `/login`              | page + server actions (log in, resend)             | `users.logIn` → `/me`                                                                            |
| `/logout`             | server action (POST only)                          | `users.logOut` → `/login`                                                                        |
| `/me`                 | page                                               | `users.getCurrentUser` (redirects to `/login` if there is no session) → `profiles.getOwnProfile` |

There is no `next` or `returnTo` parameter anywhere in 0001; redirect targets are hard-coded, which removes the open-redirect threat.

## Data model

**Migration `0001_profiles`** creates schema `profiles` and this table:

```sql
create table profiles.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,  -- ADR-0004 §5
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles.profiles enable row level security;
alter table profiles.profiles force row level security;
revoke all on profiles.profiles from anon, authenticated;
grant select on profiles.profiles to authenticated;
create policy profiles_select_own on profiles.profiles
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert/update/delete policies: writes only via service role (ensureProfile).
```

Display name, bio and avatar columns arrive with "Edit name, bio, avatar" in Release 1. They are not added now.

**Migration `0001_ratelimit`** (ADR-0005) creates:

- schema `ratelimit` and table `ratelimit.buckets`, with RLS enabled and no policies;
- function `ratelimit.hit(...)`, executable only by `service_role`;
- an hourly `pg_cron` cleanup job.

**`supabase/config.toml`:**

- exposed schemas: add `profiles` and `ratelimit`;
- `[auth]`: email confirmations on, `minimum_password_length = 12`, `jwt_expiry = 900`;
- confirmation email template pointing to `/auth/confirm?token_hash={{ .TokenHash }}&type=email`;
- local `[auth.rate_limit]` values raised so the system suite isn't throttled by Supabase. Our own limiter, which AC9 tests, is unaffected. Production values are set in 0002.

### RLS policies

| Table / object              | anon   | user (own) | user (other) | moderator                     | admin           |
| --------------------------- | ------ | ---------- | ------------ | ----------------------------- | --------------- |
| `profiles.profiles`         | none   | select     | none         | n/a (role added in Release 1) | n/a (Release 1) |
| `ratelimit.buckets`         | none   | none       | none         | n/a                           | n/a             |
| `ratelimit.hit()` (execute) | denied | denied     | denied       | n/a                           | n/a             |

`service_role` bypasses RLS. It is used only in `ProfileStore.insertIfMissing` and in `RateLimiter`.

## Adapters

| Interface                               | Location                       | Real implementation                                                                     | Fake                                                                                        |
| --------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `AuthProvider` (new)                    | `src/lib/adapters/auth/`       | `real/supabase.ts`: a `@supabase/ssr` server client bound to the request's cookie store | `fake.ts`: in-memory users, sessions and issued tokens; test helper `issuedTokenFor(email)` |
| `RateLimiter` (new, ADR-0005)           | `src/lib/adapters/rate-limit/` | `real/postgres.ts`: service-role client calling `ratelimit.hit`                         | `fake.ts`: in-memory, with an injectable clock                                              |
| `ProfileStore` (module store, ADR-0004) | `src/modules/profiles/store/`  | `real/supabase.ts`                                                                      | `memory.ts`                                                                                 |

```ts
interface AuthProvider {
  signUp(email: string, password: string): Promise<'ok' | 'rate_limited'>; // identical outcome for new and existing emails
  verifyEmailToken(
    tokenHash: string,
  ): Promise<{ ok: true; userId: UserId } | { ok: false; reason: 'invalid' | 'rate_limited' }>;
  signInWithPassword(
    email: string,
    password: string,
  ): Promise<
    | { ok: true; userId: UserId }
    | { ok: false; reason: 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' }
  >;
  resendVerification(email: string): Promise<'ok' | 'rate_limited'>;
  signOut(): Promise<void>; // revokes the refresh token server-side, clears cookies
  getUser(): Promise<{ id: UserId } | null>; // verified against the auth server
}
interface RateLimiter {
  hit(
    key: string,
    rule: { limit: number; windowSeconds: number },
  ): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>;
}
```

Mailer: not needed in 0001, because Supabase Auth sends the verification email itself. Locally it goes to Mailpit, which system and contract tests read through its HTTP API. A real provider comes in 0002.

## Security controls

| Threat (spec)                                          | Control                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enumeration on sign-up (AC4)                           | Supabase returns the same result for existing emails (no error, no email). `users.signUp` maps every non-error result to `check_email`. `withMinimumDuration(800 ms)` evens out response time.                                                                                                                                                                                                                                                                |
| Enumeration on log-in / resend (AC7, AC9)              | A single `invalid_credentials` outcome for unknown emails and wrong passwords. Resend always returns `sent_if_applicable`. The same minimum duration applies. The rate-limited response is identical whether or not the account exists.                                                                                                                                                                                                                       |
| Brute force / credential stuffing (AC9)                | The ADR-0005 limiter is checked **before** calling Supabase, on the IP and email dimensions: log-in 5 per 15 min, sign-up 3 per hour, resend 3 per hour. Supabase's built-in limits are the second layer: per-IP 429s map to `rate_limited`. For sign-up and resend, the account-specific responses (`user_already_exists`, and the per-account `over_email_send_rate_limit`) map to `ok`, because surfacing them would reveal that the account exists (AC4). |
| IDOR / RLS (AC13)                                      | `getOwnProfile` uses the user-scoped client, so RLS enforces `user_id = auth.uid()`. There are no write grants for `authenticated`. RLS tests cover direct anon-key access.                                                                                                                                                                                                                                                                                   |
| Client-supplied identity (AC14)                        | No module API takes a user ID from input. The user ID comes only from `AuthProvider.getUser()` (server-verified). Zod schemas are `.strict()`, so unknown fields such as `userId` are rejected.                                                                                                                                                                                                                                                               |
| Session theft: XSS (AC16, AC17)                        | Nonce-based CSP with `'strict-dynamic'`; no `unsafe-inline`; `unsafe-eval` only in `next dev`. `connect-src 'self'`. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`. No `dangerouslySetInnerHTML`.                                                                                                                                                                                                                           |
| CSRF                                                   | Every mutation is a server action (POST with Next's built-in Origin check). `/logout` is POST only. `SameSite=Lax` cookies.                                                                                                                                                                                                                                                                                                                                   |
| Clickjacking (AC16)                                    | `frame-ancestors 'none'` and `X-Frame-Options: DENY`.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Verification-link replay, tampering and scanners (AC5) | Single-use token hash, verified by Supabase. Expired, used or invalid links map to `invalid_link`. GET does not consume the token (confirm button).                                                                                                                                                                                                                                                                                                           |
| Logout gap (AC10)                                      | `signOut` revokes the refresh token. The app checks `getUser()` on every request, so the app session is gone immediately. The leftover access-JWT lifetime for direct PostgREST use is capped at 15 min by `jwt_expiry = 900`, and RLS limits what it can reach to the user's own row.                                                                                                                                                                        |
| Open redirect                                          | There are no redirect parameters (see Routes).                                                                                                                                                                                                                                                                                                                                                                                                                |
| Password policy (AC3)                                  | Zod: 12–72 **UTF-8 bytes**, matching the bcrypt limit Supabase enforces, plus Supabase `minimum_password_length = 12`.                                                                                                                                                                                                                                                                                                                                        |
| Personal data in logs (AC20)                           | `lib/log` accepts only allowlisted field keys (`event`, `outcome`, `action`, `durationMs`, `errorCode`, `requestId`). Unknown keys are dropped, and values that look like emails or JWTs are redacted. Vendor error messages are never logged, only codes.                                                                                                                                                                                                    |
| Secrets                                                | `SUPABASE_SERVICE_ROLE_KEY` and `RATE_LIMIT_KEY_SECRET` are read only in `lib/env.ts` (server-only, guarded by `import 'server-only'`). No `NEXT_PUBLIC_*` Supabase variables exist. `.env.example` holds placeholders only.                                                                                                                                                                                                                                  |
| Missing RLS on a future table (AC18)                   | A global RLS test fails if any table outside Supabase's system schemas has RLS disabled.                                                                                                                                                                                                                                                                                                                                                                      |

## Test plan

| Level       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Location                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Unit (100%) | `users` flows against fakes: every outcome branch, the order of rate-limit checks, enumeration-equal outcomes, Supabase rate-limit mapping, `ensureProfile` called after confirm and log-in, `.strict()` rejecting `userId`. `profiles` API. Zod schemas (byte-length edge cases). Header/CSP builder (dev vs production). Cookie options. Client IP extraction. Rate-limit keys (HMAC, normalization) and policy. Logger redaction. `withMinimumDuration` (fake clock). `env` validation. | `src/modules/{users,profiles}/**/*.test.ts`, `src/lib/**/*.test.ts` |
| Contract    | `AuthProvider` (fake + Supabase local, with Mailpit for tokens); `RateLimiter` (fake + Postgres: atomicity under concurrent hits, window reset); `ProfileStore` (memory + Supabase); `UsersApi` and `ProfilesApi` (fake-wired + real-wired).                                                                                                                                                                                                                                               | `tests/contracts/`                                                  |
| RLS         | `profiles.profiles`: select / insert / update / delete × anon, own user, other user. `ratelimit.buckets` and `ratelimit.hit` denied for anon and authenticated. Global check: RLS enabled on every app table.                                                                                                                                                                                                                                                                              | `tests/rls/`                                                        |
| System      | One Playwright test per `@regression` AC, named `[0001-ACn]`: AC1, AC2, AC6, AC7, AC10, AC11, AC15. Also: AC4, AC5, AC8, AC9 and AC12 end to end; AC16 and AC17 header and cookie assertions; AC20 scans the captured server log for each test's email and password. AC15 runs in 360 px, tablet and desktop projects (no horizontal scroll; inputs found by label). Each test uses a unique email and a unique `X-Forwarded-For`.                                                         | `tests/system/`                                                     |
| CI (AC19)   | The workflow runs lint, typecheck, unit, RLS, contracts, build and system tests in the same order as `pnpm verify`. Branch protection is a GitHub setting (see Risks).                                                                                                                                                                                                                                                                                                                     | `.github/workflows/ci.yml`                                          |

**AC → tests coverage:**

- AC1–AC14 and AC20: unit, plus system tests where listed above.
- AC13: RLS and contract tests.
- AC15: system tests.
- AC16 and AC17: unit and system tests.
- AC18: RLS tests.
- AC19: the CI workflow, plus a check that branch protection is configured.

## ADRs needed

- ADR-0004 Module data access (Accepted): server-only Supabase access, module-owned stores, and a narrow exception to the adapter-location rule.
- ADR-0005 Application rate limiting (Accepted): Postgres fixed window, HMAC'd keys, trusted IP header.

The implementation PR also updates CLAUDE.md's adapter rule, the architecture overview (container diagram without browser→Postgres; `AuthProvider` and `RateLimiter` in the adapters table) and `docs/testing/strategy.md` (coverage exclusions `src/modules/*/store/real/**` and `src/server/**`).

## Risks

- **No GitHub remote exists yet.** The second half of AC19 ("cannot merge unless green") needs a GitHub repo with branch protection on `main` (task T19, done by you).
- **Next.js 16 proxy and nonce CSP** force dynamic rendering of every page. That is acceptable for this app, but the Next.js and `@supabase/ssr` cookie-refresh integration must be checked early (task 1).
- **Supabase local email limits** (`email_sent`) have to be raised in local config, or the system suite throttles itself. This is documented in `config.toml`, and production values are set in 0002.
- **Fixed-window rate limits on shared NAT** (ADR-0005): accepted for now.
- **New dependencies** (to justify in the PR): `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `server-only`, `tailwindcss`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `eslint`, `eslint-config-next`, `eslint-plugin-boundaries`, `prettier`. No logger or HTTP-client dependency is added.
