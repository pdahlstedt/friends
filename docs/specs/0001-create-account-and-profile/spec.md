# 0001 — Create an account and see my profile

|           |                                                                                                                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | Approved                                                                                                                                                                                                                                                             |
| Story map | Release 0 — Walking skeleton / Join, Present myself, Run the site                                                                                                                                                                                                    |
| Modules   | users, profiles                                                                                                                                                                                                                                                      |
| ADRs      | [0002 Modular monolith](../../adr/0002-modular-monolith.md), [0003 Platform stack](../../adr/0003-platform-stack.md), [0004 Module data access](../../adr/0004-module-data-access.md), [0005 Application rate limiting](../../adr/0005-application-rate-limiting.md) |
| Amended   | 2026-10-04: AC2 requires an explicit confirm step, so email link scanners cannot consume the token                                                                                                                                                                   |

## User value

As someone who wants to discuss things I can't discuss with my everyday friends, I want to create an account with only an email and a password, without revealing who I am, and see my own private profile page, so that I have a safe, secure place in the community to return to.

As the team, we want this first slice to run end to end on the full local stack with every CI gate in place, so that every later slice is built on proven auth, RLS, test and security foundations.

**Why now:** this is the walking skeleton. It retires the main technical risks (auth flow, session handling, RLS pattern, module boundaries, test infrastructure) before any feature is built on top. Production deployment follows in 0002.

## Acceptance criteria

### Sign up

- **AC1** @regression — Given any visitor who is not logged in (sign-up is open, no invite needed), when they submit the sign-up form with a valid email and a password that meets the password policy, then an unverified account is created, a verification email is sent, and they see a "check your email" page.
- **AC2** @regression — Given an unverified account, when the user opens the verification link from the email and confirms on the page it opens, then the email is marked verified, the user is logged in automatically (a session is created) and is taken to their own profile page.
- **AC3** — Given a visitor on the sign-up form, when they submit a malformed email or a password that does not meet the policy (fewer than 12 or more than 72 characters), then they see field-level errors, and no account is created and no email is sent.
- **AC4** (abuse: enumeration) — Given an email that already has an account, when a visitor signs up with it, then they see exactly the same response as in AC1 (same page, same wording, comparable timing), and the existing account is unchanged (password, verification state, sessions).
- **AC5** (denied) — Given a verification link that is expired, already used or tampered with, when it is opened and confirmed, then the account is not verified, the user sees a generic "link invalid or expired" message and can request a new verification email.

### Log in

- **AC6** @regression — Given a verified user who is logged out, when they log in with the correct email and password, then a session is created and they are taken to their own profile page.
- **AC7** @regression (abuse: enumeration) — Given a visitor on the login form, when they submit an unknown email, or a known email with a wrong password, then they see the same generic "email or password is incorrect" message in both cases, and no session is created.
- **AC8** (denied) — Given an unverified account, when the user logs in with the correct password, then no session is created, they are told to verify their email, and they can request a new verification email.
- **AC9** (abuse: rate limiting) — Given repeated attempts from the same IP or against the same email, when the number of requests exceeds the limit (login: 5 per 15 min; sign-up: 3 per hour; resend verification: 3 per hour; each per IP and per email), then further requests are rejected with a generic "too many attempts, try again later" message until the window passes. This holds even if the credentials are correct, and the response does not reveal whether the account exists.

### Log out

- **AC10** @regression — Given a logged-in user, when they log out, then the session is invalidated server-side, the auth cookies are cleared, and visiting their profile page (including via browser back) redirects to the login page.

### Own profile page

- **AC11** @regression — Given a newly verified user, when they open their profile page, then they see their own profile in an empty state: no display name, bio or avatar yet, and a clear placeholder. A profile record is created automatically for every new account; the user does not create it.
- **AC12** (denied) — Given a visitor who is not logged in, when they request the profile page, then they are redirected to the login page and the response contains no profile data.
- **AC13** (denied: IDOR / RLS) — Given user A is logged in, when A tries to read, create, update or delete user B's profile record, either through the app or directly against the database with the public anon key, then access is denied and nothing changes. In this slice a user may read only their own profile record and may not write any profile record directly.
- **AC14** (denied: client-supplied identity) — Given a logged-in user, when a request to any route handler or server action includes a user ID in the body, query or headers, then that value is ignored and identity is taken only from the server-verified session.

### Usability

- **AC15** @regression — Given a phone (360 px wide), tablet or desktop viewport, when a user goes through sign-up, log in, profile and log out, then every page is usable without horizontal scrolling and all controls are reachable and labelled.

### Guardrails (Run the site)

- **AC16** — Given any HTML response from the app, then it carries strict security headers: a CSP with no `unsafe-inline` / `unsafe-eval` for scripts (nonce-based), `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
- **AC17** — Given the session cookies set by the app, then they are `HttpOnly`, `Secure` (outside plain-http local dev), `SameSite=Lax` and scoped to the app host.
- **AC18** — Given the database schema, when the RLS test suite runs, then it verifies that every table has RLS enabled and checks allowed and denied access for anon, the owning user and another user. A table without RLS enabled makes the suite fail.
- **AC19** — Given a pull request to `main`, when CI runs, then `pnpm verify` runs in full (lint including the module-boundaries rule, typecheck, unit tests at the 100% coverage threshold, contract, RLS and system tests), and the PR cannot merge unless it is green.
- **AC20** — Given any sign-up, login, verification or logout flow, including failures, then application logs contain no passwords, tokens, session cookies or email addresses.

## Security & privacy

- **Data touched (personal data?):** yes. Email address and password hash (held by Supabase Auth); a profile record linked to the user ID (empty in this slice); session cookies; IP addresses, held transiently for rate limiting.
- **Who may read / write (roles):**
  - anon: may sign up, log in and verify. No access to any profile record.
  - user: may read only their own profile record. No direct writes; the profile record is created server-side on account creation.
  - other user: no access to someone else's profile (public profiles come in Release 1).
  - moderator / admin: these roles do not exist yet. They are added in Release 1 with their own RLS tests.
- **Threats considered:**
  - Account enumeration through sign-up, login and resend (AC4, AC7, AC9).
  - Credential stuffing and brute force (AC9).
  - IDOR on profile records, and trusting client-supplied IDs (AC13, AC14).
  - Session theft through XSS or CSRF (AC16, AC17; server actions are POST-only with an origin check).
  - Clickjacking (AC16).
  - Verification-link replay or tampering (AC5).
  - Open redirect via a post-login or post-verify `next` parameter: only same-origin relative paths are allowed.
  - Secrets: the service-role key is server-only, and `.env.example` contains placeholders only.
  - Personal data in logs (AC20).
- **GDPR / DSA impact:** this slice creates personal data (email). Account deletion and data export are not in this slice; deletion is in Release 1 and export in Release 2. Acceptable because 0001 only runs locally and in CI. **0002 (going live) must not ship before account deletion exists, or it must explicitly accept that risk.** Nothing user-generated can be reported yet, so there is no DSA impact.

## Out of scope

- Production deployment, Cloudflare, real email provider: spec 0002.
- OAuth login, MFA, password reset and changing email/password.
- Editing profile fields, avatar upload, viewing other users' profiles.
- Account deletion and data export.
- Roles (moderator / admin) and the admin area.
- Turnstile / CAPTCHA: deferred to 0002, because it needs a real domain.
- Localisation: the UI is English only.

## Decisions

- **Sign-up access:** open to anyone; no invites.
- **Turnstile:** deferred to 0002. Rate limiting (AC9) covers abuse until the site is public.
- **Password policy:** 12–72 characters; no composition rules.
- **Rate limits:** login 5 per 15 min, sign-up 3 per hour, resend verification 3 per hour; each per IP and per email.
- **After verification:** the user is logged in automatically (AC2).
- **Rate-limit layers:** both Supabase Auth's built-in limits and our own server-side limiter. Our limiter is what AC9 tests; Cloudflare rate limiting is added on top in 0002.
- **Password reset:** added to the story map in Release 1 (Join). It stays out of scope here.
- **Verification link:** opening the link (GET) never consumes the token; the user confirms with a button (POST). This protects against email security scanners that follow links (AC2, AC5).
- **Breached-password check:** deferred to a later slice. Supabase's built-in check needs a paid plan; the free alternative is a k-anonymity check against Have I Been Pwned.

## Open questions

- None.

## Traceability

<!-- Filled in during Verify. Every AC must have at least one automated test. -->

| AC  | Test level | Test file / name |
| --- | ---------- | ---------------- |
|     |            |                  |
