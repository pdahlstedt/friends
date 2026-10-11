# 0002 — Delete my account

|           |                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | Done                                                                                                                                                                                                        |
| Story map | Release 1 — Minimum lovable / Join ("Delete my account (GDPR)"); pulled forward as the GDPR gate for going live (0003)                                                                                      |
| Modules   | users, profiles                                                                                                                                                                                             |
| ADRs      | [0002 Modular monolith](../../adr/0002-modular-monolith.md), [0004 Module data access](../../adr/0004-module-data-access.md), [0005 Application rate limiting](../../adr/0005-application-rate-limiting.md) |

## User value

As a member, I want to delete my account and everything I have stored here myself, at any time and without having to ask anyone, so that I stay in control of my data and can leave without a trace.

As the team, we want self-service deletion in place before the first real users arrive, so that going live (0003) does not have to accept a GDPR risk (spec 0001, "GDPR / DSA impact").

**Why now:** 0001 decided that going live must not ship before account deletion exists. This slice is small, runs entirely on the local stack, and sets the pattern every later module must follow: each module that stores personal data deletes it when the account is deleted.

## Acceptance criteria

### Delete my account

- **AC1** @regression — Given a logged-in user, when they open their profile page, then they can reach a "Delete account" page that explains, before anything happens, what will be deleted (account, email address, profile), that it is immediate and cannot be undone.
- **AC2** @regression — Given a logged-in user on the "Delete account" page, when they confirm with their current password, then their account and all their data are deleted, they are logged out (session invalidated server-side, auth cookies cleared), and they see an "Your account has been deleted" page.
- **AC3** @regression — Given an account that has been deleted, when someone logs in with its old email and password, then they see the same generic "email or password is incorrect" message as for any unknown email (0001 AC7), and no session is created.
- **AC4** — Given an account that has been deleted, then no record of it remains in the application database: no Supabase Auth user, no profile record, and nothing else that refers to its user ID. The test checks every table that has a user-ID column, so a future table that is not cleaned up makes it fail.
- **AC5** — Given an account that has been deleted, when someone signs up again with the same email address, then this works like a brand-new sign-up (0001 AC1) and results in a new, empty account that shares nothing with the old one.

### Denied and abuse paths

- **AC6** (denied) — Given a logged-in user on the "Delete account" page, when they confirm with a wrong or empty password, then nothing is deleted, they stay logged in, and they see a generic "password is incorrect" message.
- **AC7** (abuse: rate limiting) — Given repeated delete attempts from the same user or the same IP, when they exceed 5 per 15 minutes, then further attempts are rejected with the generic "too many attempts, try again later" message until the window passes, even with the correct password, and nothing is deleted.
- **AC8** (denied) — Given a visitor who is not logged in, when they request the "Delete account" page or submit the delete action, then they are redirected to the login page and nothing is deleted.
- **AC9** (denied: client-supplied identity) — Given a logged-in user A, when the delete request includes another user's ID or email (in the body, query or headers), then that value is ignored: only A's own account, taken from the server-verified session, can ever be deleted, and user B is unaffected.
- **AC10** (denied: CSRF / link-triggered deletion) — Given a logged-in user, when the "Delete account" page is opened with GET (including from a link, a link scanner or a cross-site page), then nothing is deleted; deletion happens only through the POST confirm action with a same-origin request and the password.
- **AC11** (other sessions) — Given a user who is logged in on two devices, when they delete their account on one, then the other device's session stops working immediately: its next request to the profile page redirects to the login page.

### Consistency

- **AC12** — Given a deletion that fails part-way (for example the auth service is unavailable), then the user sees a generic "something went wrong, your account was not deleted, please try again" message, they can retry, and a retry completes the deletion. The account is never left half-deleted in a way the user can still log into but whose data is gone, or vice versa.

### Usability

- **AC13** @regression — Given a phone (360 px), tablet or desktop viewport, when a user goes through profile → delete account → deleted confirmation, then every page is usable without horizontal scrolling and all controls are reachable and labelled (as 0001 AC15).

### Guardrails

- **AC14** — Given any deletion attempt, successful or not, then application logs contain no passwords, tokens, session cookies, email addresses or user IDs (extends 0001 AC20). A deletion is logged only as an event with its outcome.
- **AC15** — Given the new page and action, then they carry the same security headers and cookie properties as every other page (0001 AC16, AC17).

## Security & privacy

- **Data touched (personal data?):** yes. Deletes the email address and password hash (Supabase Auth), the session records, and the profile record. Rate-limit buckets hold only HMAC'd keys and expire with their window (ADR-0005); they are not linked to the user ID.
- **Who may read / write (roles):**
  - anon: no access to the page or the action.
  - user: may delete only their own account, after re-entering their password.
  - other user: cannot delete or affect anyone else's account.
  - moderator / admin: these roles do not exist yet. Admin-initiated deletion is out of scope.
- **Threats considered:**
  - Account takeover leading to deletion, e.g. a stolen session or an unattended logged-in device (AC2, AC6: password re-entry).
  - Password brute force through the delete form (AC7).
  - CSRF and link-triggered deletion (AC10).
  - IDOR and client-supplied identity (AC9).
  - Enumeration: after deletion the account looks exactly like one that never existed (AC3, AC5).
  - Revoked sessions that still work (AC11).
  - Partial deletion leaving orphaned personal data (AC4, AC12).
  - Personal data in logs (AC14).
- **GDPR / DSA impact:**
  - Implements the right to erasure (Art. 17) for everything stored in this slice. It is self-service and immediate.
  - Sets the rule for later modules: every module that stores personal data must delete it when the account is deleted, and AC4's check covers new tables automatically. Storage objects (photos) and the Stripe customer link are added to deletion in the specs that introduce them.
  - Database backups: deleted data may persist in Supabase backups until they expire. This must be stated in the privacy notice (0003).
  - No DSA impact: nothing user-generated can be reported yet.

## Out of scope

- Grace period or "undo": deletion is immediate.
- A confirmation email after deletion.
- Data export (Release 2).
- Admin- or moderator-initiated deletion and suspension (Release 1, admin).
- Automatic clean-up of accounts that never confirmed their email: spec 0003.
- Deleting storage objects and Stripe customers: added by the specs that introduce them.
- Production deployment and the privacy notice: spec 0003.

## Decisions

- **Re-authentication:** re-entering the current password is enough; no typed confirmation word.
- **Timing:** deletion is immediate, with no grace period.
- **Confirmation email:** none in this slice (it would need our own mailer and would process the email after deletion).
- **Unconfirmed accounts:** they cannot log in, so they cannot delete themselves. Automatic clean-up comes in 0003, before going live.
- **Rate limit:** 5 delete attempts per 15 minutes, per user and per IP (the same as login).

## Open questions

- None.

## Traceability

| AC   | Test level             | Test file / name                                                                                                                                                                                                                                                                    |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | System                 | `tests/system/account-deletion.spec.ts` `[0002-AC1]`                                                                                                                                                                                                                                |
| AC2  | Unit, contract, system | `src/modules/users/api.test.ts`; `tests/contracts/users/users-api.contract.ts` (fake- and real-wired), `tests/contracts/auth/auth-provider.contract.ts` (`verifyPassword` leaves the session, `signOut` after `deleteUser`); `account-deletion.spec.ts` `[0002-AC2]`                |
| AC3  | Contract, system       | `auth-provider.contract.ts`, `users-api.contract.ts`; `account-deletion.spec.ts` `[0002-AC3]`                                                                                                                                                                                       |
| AC4  | Unit, contract, RLS    | `src/lib/adapters/auth/fake.test.ts`; `users-api.contract.ts` real-wired residue scan (`tests/support/residue.ts`), `tests/contracts/users/user-account-store.contract.ts`; `tests/rls/users.test.ts` (sweep), `tests/rls/user-foreign-keys.test.ts` (cascade on every user column) |
| AC5  | Contract, system       | `auth-provider.contract.ts`, `users-api.contract.ts`; `account-deletion.spec.ts` `[0002-AC5]`                                                                                                                                                                                       |
| AC6  | Unit, contract, system | `src/modules/users/api.test.ts`, `src/lib/adapters/auth/errors.test.ts`; `auth-provider.contract.ts`, `users-api.contract.ts`; `account-deletion.spec.ts` `[0002-AC6]`                                                                                                              |
| AC7  | Unit, contract, system | `src/lib/rate-limit/policy.test.ts`, `src/modules/users/api.test.ts`, `errors.test.ts`; `users-api.contract.ts`; `account-deletion.spec.ts` `[0002-AC7]`                                                                                                                            |
| AC8  | Unit, contract, system | `src/modules/users/api.test.ts`; `users-api.contract.ts`; `account-deletion.spec.ts` `[0002-AC8]` (page and action)                                                                                                                                                                 |
| AC9  | Unit, contract, system | `src/modules/users/api.test.ts`; `users-api.contract.ts`; `account-deletion.spec.ts` `[0002-AC9]` (forged form fields)                                                                                                                                                              |
| AC10 | System                 | `account-deletion.spec.ts` `[0002-AC10]` (GET deletes nothing; cross-origin POST rejected, same-origin control accepted)                                                                                                                                                            |
| AC11 | Contract, system       | `auth-provider.contract.ts`, `users-api.contract.ts`; `account-deletion.spec.ts` `[0002-AC11]`                                                                                                                                                                                      |
| AC12 | Unit, contract         | `src/modules/users/api.test.ts` (each step unavailable, then retry; erase and sign-out failures after the delete), `errors.test.ts`, `src/modules/users/store/memory.test.ts`; `auth-provider.contract.ts`, `user-account-store.contract.ts` (idempotent)                           |
| AC13 | System                 | `tests/system/responsive.spec.ts` `[0002-AC13]` in the desktop, phone (360 px) and tablet projects                                                                                                                                                                                  |
| AC14 | Unit, system           | `src/modules/users/api.test.ts`; `tests/system/server-log.spec.ts` `[0002-AC14]`, plus the per-test server-log check (now including user IDs) in `tests/system/support/fixtures.ts`                                                                                                 |
| AC15 | System                 | `tests/system/security-headers.spec.ts` (`/account/delete`, `/account/deleted`); cookie properties unchanged, covered by 0001 AC17 tests                                                                                                                                            |
