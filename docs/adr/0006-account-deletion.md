# ADR-0006: Account deletion — atomic auth delete with cascading module tables, then erasure of what Supabase keeps

- Status: Proposed
- Date: 2026-10-10
- Related specs: 0002
- Amends: [ADR-0004](0004-module-data-access.md) §5 (once accepted)

## Context

Spec 0002 adds self-service account deletion. It must be immediate, leave no data that refers to the user (AC4), and never leave a half-deleted account: one the user can still log into although their data is gone, or the other way round. A failed deletion must be safe to retry (AC12).

Several facts shape the design:

- **ADR-0004 §5** allows exactly one cross-schema reference: a module table → `auth.users(id) ON DELETE CASCADE`, "as a safety net for GDPR deletion", and adds that "account deletion still goes through module APIs". Taken literally, the users module would call each module's delete method first and delete the auth user last. Those are separate requests with no shared transaction. If the auth delete then fails, the user can still log in to an account whose data is gone, which AC12 forbids. (In 0001, logging in even recreates an empty profile.)
- **Supabase Auth deletes the user in one database transaction** (`auth.admin.deleteUser`). Rows in module tables with the cascading foreign key are removed in that same transaction, so the deletion either happens completely or not at all.
- **Supabase Auth keeps personal data outside `auth.users`.** `auth.audit_log_entries` has no foreign key to the user. Verified locally on 2026-10-10: entries for sign-up, log-in and log-out carry the email (`actor_username`), and deleting a user writes a new `user_deleted` entry containing `user_email` and `user_id`. These rows survive the deletion.
- **Later modules will hold data outside Postgres:** photo objects in Storage (media) and a customer in Stripe (billing). The CLAUDE.md GDPR rule requires deleting those too. They cannot join a database transaction.

## Decision

We will:

1. **Make `users.deleteAccount` the only way to delete an account.** It checks the session and the password, applies the rate limit, and then carries out the steps below in this order. Identity comes only from the session.
2. **Delete module tables by cascade, in the auth transaction.** Every module table that holds a user's data must have a foreign key to `auth.users(id) ON DELETE CASCADE` on its user column. Deleting the auth user is the single atomic step that removes the account, its sessions and all module rows. This replaces the sentence in ADR-0004 §5 that deletion "still goes through module APIs": for Postgres data, the cascade is the mechanism, not just a safety net. A catalog test enforces it: every column that refers to a user must carry that foreign key (spec 0002, AC4).
3. **Erase what Supabase Auth keeps, both right after the delete and by a periodic sweep.**
   - The `users` schema gets a `security definer` function, `users.erase_auth_audit(user_id uuid, email text)`. It deletes `auth.audit_log_entries` rows whose actor ID, `traits.user_id`, actor email or `traits.user_email` match the user. Only `service_role` may execute it. `deleteAccount` calls it right after the auth delete.
   - A daily `pg_cron` job removes audit entries that refer to a user ID no longer present in `auth.users`. This backstop covers a failed synchronous erase, because once the account is gone the user cannot retry it.
   - The audit log is otherwise unused by the app. Whether production should stop writing it to the database altogether (a Supabase setting) is decided in 0003. The erase stays either way, so local, CI and production behave the same.
4. **Handle data outside Postgres after the commit point, through a durable erasure queue.** This is defined now and built with the first module that needs it (media). After the auth delete, each such module's idempotent erasure step (e.g. delete storage objects, delete the Stripe customer) runs from a queue table in the `users` schema. The queue holds the user ID and the pending steps, never an email. It is retried until each step succeeds. No such step exists in 0002.
5. **Keep vendor knowledge contained.** The audit-log erase is one migration and one privileged call in `store/real/`. A contract test checks that no rows for a deleted user remain anywhere in `auth` or the module schemas (spec 0002, AC4), so a Supabase upgrade that adds a new place for user data makes the suite fail.

## Alternatives considered

| Option                                                                                          | Pros                                                   | Cons                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Cascade in the auth transaction, then erase what remains (chosen)**                        | Atomic for every Postgres table; retry-safe; small now | Relies on the foreign-key rule for every module table (enforced by a test); data outside Postgres needs a queue later; touches the Supabase-owned `auth` schema in one function |
| B. Module APIs delete first, auth user last (ADR-0004 §5 as written)                            | Each module visibly deletes its own data               | Not atomic. A failure leaves an account that can still log in with its data gone (breaks AC12). Rows are deleted twice (API, then cascade).                                     |
| C. Lock first (ban the user and revoke sessions), delete module data, then delete the auth user | Works for data outside Postgres too                    | The user cannot retry a locked account, so a background job is needed now; more moving parts than 0002 needs                                                                    |
| D. Soft delete (flag now, hard delete later by a job)                                           | Easy to undo                                           | The spec decided on immediate deletion; personal data stays until the job runs                                                                                                  |
| Audit log: no erase, rely on Supabase retention                                                 | No code in the `auth` schema                           | The email outlives the account for as long as the database keeps it, which fails AC4 and Art. 17                                                                                |
| Audit log: only disable writing it to the database                                              | Nothing to erase in production                         | Not available or not identical locally; existing rows remain; tests could not prove AC4. Kept as a possible addition in 0003.                                                   |

## Consequences

- **Security and privacy:** deletion is all-or-nothing for the account and its Postgres data. No email or other personal data remains in the auth audit log after deletion: it is erased at once, with a daily backstop. Anyone who adds a module table gets a test failure if it lacks the cascading key.
- **Architecture:** ADR-0004 §5 changes meaning (the cascade becomes the deletion mechanism for Postgres data). Module APIs do not get delete methods only for account deletion. The `users` schema appears for the first time, holding just this function (and later the erasure queue).
- **Cost:** none. `pg_cron` is already used (ADR-0005).
- **Lock-in:** the erase function depends on the column layout of Supabase's `auth.audit_log_entries`. The AC4 contract test detects a change. Moving away from Supabase Auth replaces this function with the new provider's equivalent.
- **Harder:** a module cannot run its own logic when a user's rows are deleted, because the cascade happens inside Postgres. Anything that needs logic (e.g. external objects) must use the erasure queue.

## Exit strategy

Switching to option C (lock, then delete) needs only `users.deleteAccount` and a background job to change. The module tables and their foreign keys stay as they are. Removing the audit-log erase means dropping one function and one cron job. Both changes are at most about a day.
