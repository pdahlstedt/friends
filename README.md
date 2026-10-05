# Friends

A safe, private community: accounts, profiles, chat, photos, subscriptions and moderation.
Built as a Next.js modular monolith on Supabase. See [`docs/`](docs/README.md) for the product
vision, specs, ADRs and architecture, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow.

## Development environment

### Prerequisites

| Tool                                                                                   | Version                  | Notes                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Node.js                                                                                | 24 (pinned in `.nvmrc`)  | With nvm: `nvm install && nvm use`. Older Node fails, e.g. the RLS tests error with "native WebSocket not found" on Node 20. |
| pnpm                                                                                   | pinned in `package.json` | `corepack enable` installs the right version automatically.                                                                  |
| Docker                                                                                 | any recent               | Docker Desktop, OrbStack or similar. The local Supabase stack runs in containers.                                            |
| [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | none to install          | It is a dev dependency; run it as `pnpm exec supabase …`.                                                                    |

### First-time setup

```sh
nvm use                       # Node 24 from .nvmrc
corepack enable               # pnpm at the pinned version
pnpm install

pnpm exec supabase start      # first run pulls images; applies migrations and seed
cp .env.example .env.local
```

Fill in `.env.local`:

- `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`: the `ANON_KEY` and `SERVICE_ROLE_KEY`
  values from `pnpm exec supabase status -o env`. These are well-known local demo keys, but keep
  them in `.env.local` (git-ignored) anyway.
- `RATE_LIMIT_KEY_SECRET`: generate one with `openssl rand -base64 48`.
- `TRUSTED_IP_HEADER`: leave empty locally.

Then start the app:

```sh
pnpm dev                      # http://localhost:3000
```

### Local services

| Service         | URL                                                       | Use                                                |
| --------------- | --------------------------------------------------------- | -------------------------------------------------- |
| App             | http://localhost:3000                                     | `pnpm dev`, or `pnpm build && pnpm start`          |
| Supabase API    | http://127.0.0.1:54321                                    | Used by the app server only                        |
| Postgres        | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Direct SQL (`psql`, DB tools)                      |
| Supabase Studio | http://127.0.0.1:54323                                    | Browse tables, auth users and policies             |
| Mailpit         | http://127.0.0.1:54324                                    | Every email the app sends, e.g. verification links |

### Day to day

```sh
pnpm exec supabase start      # start the local stack (data is kept between restarts)
pnpm exec supabase stop       # stop it
pnpm exec supabase db reset   # wipe local data and re-apply all migrations + seed
```

- **After pulling new migrations**, run `pnpm exec supabase db reset`. If `supabase start` fails
  with `supabase_rest_friends unexpected status 503`, a newly exposed schema is missing from your
  old database: run `pnpm exec supabase stop --no-backup` and start again.
- **Adding a migration:** `pnpm exec supabase migration new <name>`, then `db reset`, then
  `pnpm db:types` to regenerate `src/lib/db/types.generated.ts`.
- **CSP in development:** `next dev` gets a slightly looser Content Security Policy (`unsafe-eval`
  for React dev tooling, inline styles for the dev overlay). Production is stricter, so check
  anything CSP-related with `pnpm build && pnpm start`.

### Tests

| Command               | Needs                                | What                                          |
| --------------------- | ------------------------------------ | --------------------------------------------- |
| `pnpm lint`           | —                                    | ESLint (incl. module boundaries) and Prettier |
| `pnpm typecheck`      | —                                    | TypeScript                                    |
| `pnpm test`           | —                                    | Unit tests, 100% coverage threshold           |
| `pnpm test:rls`       | Supabase running                     | Row Level Security policies per role          |
| `pnpm test:contracts` | Supabase running                     | Module and adapter contract suites            |
| `pnpm test:system`    | Supabase running, `pnpm build` first | Playwright against the production build       |
| `pnpm verify`         | Supabase running                     | Everything CI runs, in CI order               |

Run a single test:

```sh
pnpm exec vitest run src/lib/log/index.test.ts -t "redacts"
pnpm exec vitest run --config vitest.rls.config.ts tests/rls/profiles.test.ts
pnpm exec playwright test tests/system/security-headers.spec.ts -g "nonce"
```

The first Playwright run needs a browser: `pnpm exec playwright install chromium`. The server log
of a system test run is written to `logs/server.log`.
