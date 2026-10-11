# 0002 — Plan

## Approach

Deletion follows [ADR-0006](../../adr/0006-account-deletion.md). `users.deleteAccount` is the only entry point:

1. **Session.** `auth.getUser()` is checked against the auth server. With no session the result is `not_signed_in` and nothing else runs (AC8). The user ID comes only from here (AC9).
2. **Validate.** The input is `{ password }` in a strict schema. An empty or oversized password gets the same `wrong_password` outcome as a wrong one (AC6).
3. **Our rate limit.** 5 per 15 minutes on the `ip` and `user` dimensions, checked before Supabase is called, so it holds even with the right password (AC7).
4. **Re-authenticate.** `auth.verifyPassword(password)` checks the password of the session's own user (AC2, AC6).
5. **Delete.** `auth.deleteUser(userId)` is Supabase's admin hard delete. It runs in one database transaction that also removes the user's sessions, refresh tokens and identities, and, through `ON DELETE CASCADE`, every module row (`profiles.profiles`). This is the commit point (AC2, AC4, AC11, AC12).
6. **Erase what Supabase keeps.** `store.eraseAuthLeftovers(userId)` removes the user's rows from `auth.audit_log_entries` and `auth.flow_state`. If it fails, the result is still `deleted` and an error is logged, because the daily sweep catches it (ADR-0006 §3).
7. **End this device's session.** `auth.signOut()` clears the cookies. The refresh token is already gone, and the adapter treats Supabase's 4xx answer as signed out (AC2).

Steps 3–5 can fail with `AuthProviderError` or a limiter error. The outcome is then `failed`, nothing has changed, and a retry runs the same steps again (AC12). `deleteUser` treats "user not found" as already deleted, so a retry after an unclear failure also ends in `deleted`.

Other devices (AC11) are covered by the same transaction: their refresh tokens are deleted, and every request verifies the user with `auth.getUser()` (0001), which fails for a deleted user. A copied access token therefore stops working at once in our app, even though the JWT has not expired yet.

## Modules and interfaces

| Module   | Change                                                                                                                            | Public interface change (`contract.ts`) |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| users    | `deleteAccount` flow; new store that erases Auth leftovers; new rate-limit policy; first `users` Postgres schema (functions only) | `UsersApi.deleteAccount` (below)        |
| profiles | None. `profiles.profiles` already has `user_id … references auth.users(id) on delete cascade` (0001).                             | None                                    |
| lib      | `rate-limit/policy.ts`: new `user` dimension (the HMAC'd user ID, ADR-0005)                                                       | n/a (lib)                               |

```ts
// src/modules/users/contract.ts (addition)
export interface UsersApi {
  // …0001 methods unchanged…

  /**
   * Deletes the signed-in user's account and all their data (spec 0002). Identity comes only
   * from the session; `input` is `{ password }` and is validated inside.
   */
  deleteAccount(
    input: unknown,
    ctx: RequestContext,
  ): Promise<
    | { kind: 'deleted' }
    | { kind: 'not_signed_in' }
    | { kind: 'wrong_password' }
    | { kind: 'rate_limited' }
    | { kind: 'failed' } // nothing was deleted; safe to retry (AC12)
  >;
}
```

- **Users store** (`src/modules/users/store/`, ADR-0004):
  - `store.ts`: `UserAccountStore { eraseAuthLeftovers(userId: UserId): Promise<void> }`. This method is privileged (service role) and idempotent.
  - `memory.ts`: the in-memory fake.
  - `real/supabase.ts`: calls `rpc('erase_auth_leftovers', { p_user_id })` on the `users` schema through the service-role client.
- **Rate limit:** `DELETE_ACCOUNT_LIMIT = { action: 'delete_account', dimensions: ['ip', 'user'], limit: 5, windowSeconds: 15 * 60 }` in `src/modules/users/rate-limits.ts`.
- **Composition root:** `src/server/container.ts` passes the service client to `createSupabaseAuth` (for `deleteUser`) and wires the users store.

### Routes (`src/app`, logic-free wiring)

| Route              | Kind                                                                        | Calls                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/me`              | page (changed)                                                              | Adds a "Delete account" link to `/account/delete`                                                                                                                                                        |
| `/account/delete`  | page (GET shows the explanation and a password form) + server action (POST) | Page: `users.getCurrentUser` (redirects to `/login` without a session). Action: `users.deleteAccount` → `/account/deleted`; `not_signed_in` → `/login`; other outcomes re-render the form with a message |
| `/account/deleted` | page                                                                        | None. Static "Your account has been deleted" with links to the home page and sign-up                                                                                                                     |

The action passes only `formFields(form, ['password'])` (AC9). Next.js server actions are POST-only, and Next compares `Origin` to `Host` before running one (AC10). The redirect targets are hard-coded.

Messages:

- wrong password: "Password is incorrect." (AC6)
- rate limited: the shared `RATE_LIMITED_MESSAGE` (AC7)
- failed: "Something went wrong. Your account was not deleted. Please try again." (AC12)

## Data model

**Migration `users_account_erasure`** creates the schema `users` (owned by the users module). It contains no tables in this slice.

```sql
create schema users;  -- usage: service_role only

-- ADR-0006 §3. Both security definer, set search_path = '', executable only by service_role.
users.erase_auth_leftovers(p_user_id uuid) returns void
  -- deletes the user's auth.flow_state rows, and every auth.audit_log_entries row about the
  -- user (actor_id or traits.user_id), plus entries carrying one of the user's emails
users.sweep_auth_leftovers() returns void
  -- deletes flow states and audit entries about user IDs no longer in auth.users

select cron.schedule('users-sweep-auth-leftovers', '17 3 * * *', 'select users.sweep_auth_leftovers()');
```

The migration is `supabase/migrations/20261010203518_users_account_erasure.sql`.

**Found during T5:** `auth.flow_state` (PKCE sign-up state) has the user's ID and no foreign key to `auth.users`, so it outlives the account like the audit log. The AC4 scan caught it, as ADR-0006 §5 intended. The erase and sweep cover both tables, so they are named `*_auth_leftovers`, not `*_auth_audit` as first planned.

- The function owner (`postgres`) has `DELETE` on `auth.audit_log_entries` and `auth.flow_state`; this was checked locally. Production is checked in 0003 (see Risks).
- `supabase/config.toml`: add `users` to `[api] schemas`, so the service role can call the RPC. `pnpm db:types` adds the `users` schema.
- No new cross-schema foreign keys.

### RLS and privileges

There are no tables in `users`. The privilege matrix for the functions:

| Object                             | anon    | user (own) | user (other) | service_role |
| ---------------------------------- | ------- | ---------- | ------------ | ------------ |
| `users.erase_auth_leftovers(uuid)` | denied  | denied     | denied       | allowed      |
| `users.sweep_auth_leftovers()`     | denied  | denied     | denied       | allowed      |
| `profiles.profiles` (unchanged)    | as 0001 | as 0001    | as 0001      | as 0001      |

Moderator and admin roles don't exist yet.

## Adapters

**`AuthProvider`** (`src/lib/adapters/auth/auth-provider.ts`) gains:

```ts
/** Checks the password of this request's signed-in user. 'invalid' also when signed out. */
verifyPassword(password: string): Promise<'ok' | 'invalid' | 'rate_limited'>;

/**
 * Privileged (service role). Hard-deletes the user, their sessions and, by cascade, all module
 * rows, in one transaction. Idempotent: an unknown user counts as deleted.
 */
deleteUser(userId: UserId): Promise<void>;
```

**Real implementation (`real/supabase.ts`):**

- `verifyPassword` reads the session user's email inside the adapter, where it never leaves. It signs in with that email on a separate client with no cookies and `persistSession: false`. On success it immediately signs that extra session out (`scope: 'local'`), so no stray session remains. Error mapping reuses `signInOutcome`.
- `deleteUser` calls `serviceClient.auth.admin.deleteUser(id)`. A 404 counts as success; other errors become `AuthProviderError('unavailable')`.
- `createSupabaseAuth` takes the service client as a new option.

**Fake (`fake.ts`):** `verifyPassword` and `deleteUser` work on the fake backend. Deletion removes the user, their sessions and issued tokens. The backend exposes an `onUserDeleted` hook so test wiring can cascade into the memory profile store, the same way the fake-wired contract already models the foreign key.

**Contract suite (`auth-provider.contract.ts`), new cases:**

- the right password gives `ok` and the session is unchanged;
- a wrong or empty password, or being signed out, gives `invalid`;
- after `deleteUser`, `getUser` returns null in every browser that had a session, and a sign-in with the old password fails like an unknown email;
- `deleteUser` on an unknown or already-deleted ID resolves;
- `signOut` after `deleteUser` clears the cookies without throwing.

## Security controls

| Threat (spec)                                                      | Control                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen session or unattended device deletes the account (AC2, AC6) | The current password is required, checked by Supabase Auth for the session's own user.                                                                                                                                            |
| Password brute force through the delete form (AC7)                 | Our limiter: 5 per 15 min per IP and per user ID (HMAC'd), before Supabase. Supabase's own sign-in limits apply on top.                                                                                                           |
| CSRF / link-triggered deletion (AC10)                              | GET never mutates. Deletion is a server action (POST) with Next's Origin/Host check, `SameSite=Lax` cookies, and the password as a secret the attacker doesn't know.                                                              |
| IDOR / client-supplied identity (AC9)                              | The user ID comes only from `auth.getUser()`. The action passes only `password`, and a strict schema rejects any other key.                                                                                                       |
| Enumeration after deletion (AC3, AC5)                              | The auth user is hard-deleted, so log-in and sign-up behave exactly as for an email that never existed (0001 AC4, AC7).                                                                                                           |
| Revoked sessions still working (AC11)                              | Sessions and refresh tokens are deleted in the same transaction, and every request verifies the user with the auth server.                                                                                                        |
| Partial deletion / orphaned data (AC4, AC12)                       | A single atomic delete with cascades (ADR-0006). The erase of Auth leftovers is idempotent, with a daily sweep as backstop. A catalog test requires the cascading FK on every user column. A residue scan proves nothing remains. |
| Personal data in logs (AC14)                                       | Log event `users.delete_account` with `outcome` (and `errorCode` on failure) only. The system-test log scan also checks the user's ID, taken from the JWT `sub` claim.                                                            |
| Headers and cookies (AC15)                                         | The new pages go through the same proxy and layout. They are added to `PUBLIC_PAGES` for the header test.                                                                                                                         |

## Test plan

| Level         | What                                                                                                                                                                                                                                                                                                                                                                                                                   | Location                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Unit (100%)   | `deleteAccount`: the order of steps (session → validate → limit → verify → delete → erase → sign out); every outcome; a limiter or adapter error gives `failed` with nothing deleted, and a retry gives `deleted`; an erase failure still gives `deleted` and logs an error; a strict schema rejecting `userId`/`email`; log fields. The `user` rate-limit dimension. Fake adapter: `verifyPassword`, `deleteUser`.    | `src/modules/users/**/*.test.ts`, `src/lib/rate-limit/*.test.ts`, `src/lib/adapters/auth/*.test.ts` |
| Contract      | `AuthProvider` new cases (fake and real). `UserAccountStore` erase (fake and real; the real side arranges audit entries through the admin API). `UsersApi` (fake-wired and real-wired): AC2, AC3, AC5, AC6, AC7, AC9, AC11, AC12 (retry after an injected failure, fake-wired only). AC4 residue scan (real-wired): after deletion, no row in any non-system schema, `auth` included, contains the user's ID or email. | `tests/contracts/auth/`, `tests/contracts/users/`                                                   |
| RLS / catalog | Execute privileges on `users.*` functions for anon, user and service_role. ADR-0006 catalog check: every `uuid` column named `user_id` or `*_user_id` in an app schema has a FK to `auth.users(id) ON DELETE CASCADE`. The sweep removes entries for missing users and keeps others. The cron job is scheduled. `users` is included in the "RLS on every table" check (no tables yet).                                 | `tests/rls/`                                                                                        |
| System        | `[0002-AC1]`, `[0002-AC2]`, `[0002-AC3]`, `[0002-AC13]` (@regression). Also AC5 (sign up again), AC6, AC7, AC8 (GET and POST without a session), AC9 (forged `userId` field and a second user unaffected), AC10 (GET from a link deletes nothing; a cross-origin POST is rejected), AC11 (second browser context redirected), AC15 (headers on the new pages).                                                         | `tests/system/account-deletion.spec.ts`, `responsive.spec.ts`, `security-headers.spec.ts`           |

Test-support changes:

- The superuser `db()` moves from `tests/rls/support/db.ts` to `tests/support/db.ts`, so the AC4 residue scan in the contract suite can use it. CLAUDE.md will allow it "for catalog checks and the AC4 residue scan" only.
- The phone and tablet Playwright projects switch from matching `[0001-AC15]` to a `@responsive` tag, so the viewport journeys of both specs run there.
- The server-log secret collector also collects the user ID (the JWT `sub`), so AC14's "no user IDs in logs" is checked for every test.

## ADRs needed

- [ADR-0006 Account deletion](../../adr/0006-account-deletion.md): accepted. It amends ADR-0004 §5.

## Risks

- **Supabase-owned `auth` schema.** The erase depends on `auth.audit_log_entries` (and its JSON layout) and `auth.flow_state`. If an upgrade changes it, the AC4 residue scan fails in CI. Hosted Supabase may restrict `postgres`'s `DELETE` on `auth` tables. This is checked when deploying in 0003; if it is restricted, the fallback is to stop writing the audit log to the database (ADR-0006 §3).
- **Extra audit entries from re-authentication.** `verifyPassword` signs in, which writes a `login` entry with the email. The same erase covers it, since it is matched by actor ID.
- **Supabase's built-in sign-in rate limit** also counts `verifyPassword`. Local `[auth.rate_limit]` values are already raised for the test suites (0001).
- **The AC4 scan reads every non-system table as text.** That is fine on the local and CI database, but it is never run against production.
