# 0002 — Tasks

Each task is small, independently committable, and leaves `main` green (`pnpm verify` passes).
Format: `- [ ] Tn — <description> (AC refs) — <commit type>(<scope>)`

## Foundation

- [ ] T1 — `lib/rate-limit`: a `user` dimension in the policy helper (HMAC'd user ID, ADR-0005). Unit tests at 100%. (AC7) — feat(lib)
- [ ] T2 — Migration `users_account_erasure`: `users` schema, `erase_auth_audit(uuid)` and `sweep_auth_audit()` (security definer, service_role only), daily `pg_cron` sweep; `users` added to `[api] schemas` and `pnpm db:types`. Move the superuser `db()` to `tests/support/db.ts`. RLS/catalog tests: execute privileges per role, sweep behaviour, cron job scheduled, and the ADR-0006 check that every user column has a FK to `auth.users ON DELETE CASCADE`. (AC4, AC12) — feat(users)
- [ ] T3 — `UserAccountStore`: interface, `memory.ts` fake, Supabase `real/` implementation (RPC through the service-role client), and a contract suite run against both (the real side arranges audit entries through the admin API). (AC4) — feat(users)

## Auth adapter and users module

- [ ] T4 — `AuthProvider`: `verifyPassword` (separate cookie-less client; the extra session is signed out at once) and `deleteUser` (admin hard delete; 404 counts as deleted); `createSupabaseAuth` takes the service client; fake backend with an `onUserDeleted` hook. New contract cases against the fake and local Supabase; unit tests for the fake and error mapping. (AC2, AC3, AC6, AC11, AC12) — feat(adapters)
- [ ] T5 — `users.deleteAccount`: strict `{ password }` schema, `DELETE_ACCOUNT_LIMIT` (ip + user), the step order from the plan, outcomes and logging. Composition-root wiring. Unit tests at 100%. `UsersApi` contract cases, fake-wired and real-wired (AC2, AC3, AC5, AC6, AC7, AC9, AC11, AC12), plus the real-wired AC4 residue scan across all non-system schemas. (AC2–AC9, AC11, AC12, AC14) — feat(users)

## UI and end to end

- [ ] T6 — Pages and action: a "Delete account" link on `/me`, `/account/delete` (GET explanation + password form, POST action; anonymous visitors redirected), `/account/deleted`. Add both to `PUBLIC_PAGES`. System tests `[0002-AC1]`, `[0002-AC2]`, `[0002-AC3]`, plus AC5, AC6, AC7, AC8, AC9, AC10 (GET from a link, cross-origin POST), AC11 (second browser) and AC15 (headers). (AC1–AC3, AC5–AC11, AC15) — feat(users)
- [ ] T7 — Viewports and logs: phone and tablet projects select a `@responsive` tag (the 0001 journey retagged); a `[0002-AC13]` journey through profile → delete → deleted at all three viewports; the server-log collector also collects the user ID (JWT `sub`). (AC13, AC14) — test(system)

## Close-out

- [ ] T8 — Docs: ADR-0004 status line notes the §5 amendment by ADR-0006; CLAUDE.md (cascading FK rule for module tables; `db()` allowed for catalog checks and the AC4 residue scan); architecture overview (`users` schema, deletion flow, `AuthProvider` methods); `docs/testing/strategy.md`; spec traceability table; spec status Done. — docs
