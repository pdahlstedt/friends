# ADR-0003: Platform stack — Next.js, Supabase, Stripe, Cloudflare

- Status: Accepted
- Date: 2026-10-04

## Context

Need user management, profiles, chat, photo storage, subscriptions, ads and admin with low initial cost, strong security defaults and minimal lock-in.

## Decision

- **Next.js + TypeScript** for frontend and server logic.
- **Supabase** (EU region) for Postgres, Auth, Storage, Realtime. Data access protected by Row Level Security.
- **Stripe Billing** for subscriptions; we never handle card data.
- **Cloudflare** in front for DNS, WAF, DDoS protection, rate limiting, Turnstile, and Access for `/admin`.

## Alternatives considered

| Option                             | Pros            | Cons                                         |
| ---------------------------------- | --------------- | -------------------------------------------- |
| Self-hosted Postgres + custom auth | Full control    | Patching and auth security become our burden |
| Firebase                           | Mature realtime | Proprietary data model, harder to leave      |
| AWS-native (Cognito, S3, RDS)      | Scales far      | Higher complexity and baseline cost early    |

## Consequences

- Managed services handle patching and infrastructure security.
- Lock-in limited by: standard Postgres, S3-compatible storage API, OIDC auth, adapters around all vendor SDKs, portable Node code.
- RLS correctness is critical and must be tested for every table.

## Exit strategy

Postgres dump/restore to any Postgres host; storage objects copied via S3 API; auth users exported (bcrypt hashes). Supabase is open source and can be self-hosted. Each vendor swap is confined to its adapter.
