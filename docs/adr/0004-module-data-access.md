# ADR-0004: Module data access — server-only Supabase client behind module-owned stores

- Status: Accepted
- Date: 2026-10-04
- Related specs: 0001

## Context

Spec 0001 introduces the first module tables (`profiles.profiles`) and the first authenticated reads. Several existing rules pull in different directions:

- Each module owns its tables and is the only code that touches them (ADR-0002, CLAUDE.md).
- Vendor SDKs are used only behind adapters with in-memory fakes, and business logic has 100% unit coverage against fakes.
- RLS must protect every table, and server-side authorization is required as well (defence in depth).
- Code must stay portable to plain Node/Postgres (ADR-0003).

The architecture overview currently shows the browser querying Postgres directly with the anon key. 0001 needs no browser-side data access. Removing it shrinks the attack surface: auth cookies can be `HttpOnly`, the CSP can use `connect-src 'self'`, and no Supabase key ships to the client.

We need to decide how module code reads and writes its tables, and where the vendor-specific query code lives.

## Decision

We will:

1. **Keep all data access on the server.** The browser has no Supabase client and no Supabase key. Pages, server actions and route handlers call module APIs. Supabase Realtime (chat, Release 2) will revisit this in its own ADR.
2. **Use `supabase-js` (PostgREST) on the server, with two clients per request:**
   - a **user-scoped client** that carries the user's session JWT. RLS applies, and it is the default for every read and write a user performs.
   - a **service-role client**, used only inside store methods that are explicitly privileged and named as such. In 0001 that is profile creation. These methods are never reachable without a server-side authorization check first.
3. **Give each module a store.** Every module defines a store interface for its own tables in `src/modules/<m>/store/`, with:
   - an in-memory fake in `store/memory.ts`, used by unit tests;
   - the Supabase implementation in `store/real/`, excluded from unit coverage and covered by contract tests;
   - one shared contract suite that runs against both.

   Table knowledge stays inside the owning module. This is a **narrow exception** to "vendor code lives in `src/lib/adapters/`": `@supabase/*` may be imported only in `src/lib/adapters/**/real/**` and `src/modules/*/store/real/**`, and the ESLint boundaries rule enforces it. Cross-cutting vendor integrations (auth, storage, payments, mail, realtime, rate limiting) stay in `src/lib/adapters/`.

4. **Give each module its own Postgres schema, exposed through PostgREST only where the server needs it.** Grants are explicit: `anon` gets nothing by default, `authenticated` gets only what the RLS policies need.
5. **Allow one kind of cross-schema reference:** a module table may hold a foreign key to `auth.users(id)` with `ON DELETE CASCADE`. This is a safety net for GDPR deletion. Account deletion still goes through module APIs, and no other cross-schema foreign keys are allowed.
6. **Generate database types** with `supabase gen types` into `src/lib/db/types.generated.ts`. They are used only by `store/real/` code.

## Alternatives considered

| Option                                                                                       | Pros                                                                            | Cons                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A. Module-owned stores, real implementation in the module (chosen)**                       | Table knowledge stays with the owner; small fakes; contract tests pin behaviour | Needs a recorded exception to the adapter-location rule                                                                |
| B. A generic `Db` adapter wrapping the supabase-js query builder                             | Keeps the rule literal                                                          | Leaky: it re-exports the vendor API, and a faithful fake would have to emulate PostgREST                               |
| C. Store implementations under `src/lib/adapters/db/<module>/`                               | Keeps the rule literal                                                          | Moves table knowledge out of the owning module, and `lib` would depend on module types                                 |
| D. Direct Postgres driver (Kysely + postgres.js), with RLS via `SET LOCAL role` / JWT claims | Most portable, full SQL                                                         | More dependencies, connection pooling under serverless, and it rebuilds what PostgREST already gives us; premature now |
| E. Browser queries Postgres directly with the anon key                                       | Less server code                                                                | Non-`HttpOnly` cookies, a wider CSP, RLS as the only barrier, logic split between client and server                    |

## Consequences

- **Security:** two layers on every user-facing read (server authorization plus RLS); `HttpOnly` cookies; no Supabase key in the client bundle; service-role use is confined to named store methods that are easy to review.
- **Testing:** module logic runs against fakes at 100% coverage; the contract suites prove the fakes match Postgres plus RLS.
- **Cost:** none added.
- **Lock-in:** PostgREST query code is confined to `store/real/` files. Moving to option D later means rewriting only those files, with the contract suites as the safety net.
- **Harder:** every new table needs a store interface, a fake, a real implementation and a contract suite. Each request needs two clients wired up.
- **Docs:** if this is accepted, the CLAUDE.md architecture rules and the architecture overview (container diagram, adapter rule) are updated in the 0001 implementation PR.

## Exit strategy

Replace the `store/real/` implementations with a direct Postgres driver (option D), or point them at another Postgres host. The contract suites verify the swap. The cost is roughly one day per module at current size.
