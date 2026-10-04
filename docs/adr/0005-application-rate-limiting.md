# ADR-0005: Application rate limiting in Postgres

- Status: Accepted
- Date: 2026-10-04
- Related specs: 0001

## Context
CLAUDE.md requires rate limiting on auth, uploads, chat messages and reports. Spec 0001 (AC9) decides on two layers for auth: Supabase Auth's built-in limits plus our own server-side limiter, with Cloudflare added on top in 0002. The limits are per IP **and** per email: login 5 per 15 min, sign-up 3 per hour, resend verification 3 per hour.

Our limiter must:
- work across many server instances, including serverless;
- run on the local stack and in CI, so AC9 can be tested;
- key on values from the request body (email), which edge rules cannot easily do;
- avoid storing personal data in clear text;
- add no new paid service.

## Decision
We will implement a `RateLimiter` adapter (`src/lib/adapters/rate-limit/`) with an in-memory fake and a Postgres implementation:

- **Storage:** a table `ratelimit.buckets(key text primary key, window_start timestamptz, count int, expires_at timestamptz)` in its own `ratelimit` schema, with RLS enabled and **no policies**. `anon` and `authenticated` get no grants.
- **Algorithm:** fixed window. A single SQL function `ratelimit.hit(key, limit, window_seconds)` does an atomic upsert and returns `allowed` and `retry_after_seconds`. The function is `SECURITY INVOKER`, has `search_path = ''`, and only `service_role` may execute it.
- **Keys:** `HMAC-SHA256(RATE_LIMIT_KEY_SECRET, "<action>:<dimension>:<value>")`. The value is a normalized email (trimmed, lowercased) or a client IP. Neither raw emails nor raw IPs are stored.
- **Client IP:** read only from one configured trusted header (`TRUSTED_IP_HEADER`, which will be `CF-Connecting-IP` in production). If it is not configured, all requests share one `unknown` bucket, which fails closed rather than open.
- **Cleanup:** an hourly `pg_cron` job deletes rows whose `expires_at` has passed. `pg_cron` is included with Supabase, so no new service is needed.
- **Policy:** module code describes rules declaratively (action, dimensions, limit, window). A small policy helper in `src/lib/rate-limit/` checks every dimension, so one rule covers both IP and email.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| **Postgres fixed window (chosen)** | No new service; testable locally and in CI; atomic; works across instances | One database round trip per limited request; allows up to twice the limit right at a window boundary |
| Upstash / Redis | Fast; ready-made sliding-window libraries | New paid vendor and secret; needs its own ADR and approval; harder to run in CI |
| In-memory per instance | Trivial | Wrong as soon as there is more than one instance or a serverless cold start; trivially bypassed |
| Cloudflare rate limiting only | No application code | Can't key on email in the request body; not testable locally; not available before 0002 |
| Supabase Auth built-in limits only | Free | Auth only (not uploads, chat or reports); no per-email limits we control; not testable for our own policies |
| Sliding-window log in Postgres | No boundary bursts | One row per request; more writes and cleanup; not needed at these limits |

## Consequences
- **Security:** brute-force and enumeration protection that is independent of the vendor and testable; no clear-text personal data in the limiter. The `unknown` fallback fails closed (shared bucket) instead of failing open.
- **Cost:** none added. The extra load is small at expected traffic.
- **Operations:** limits are code-reviewed constants in module rules, not environment configuration, so they can't be weakened silently.
- **Testing:** system tests use a unique `X-Forwarded-For` per test, with the trusted header set to it in the test environment. This keeps the real limits in force while isolating tests from each other.
- **Known gap:** shared NAT (offices, mobile carriers) can hit per-IP sign-up limits. We accept this for now; Cloudflare and Turnstile in 0002 can relax the per-IP rules later.

## Exit strategy
Swap the `RateLimiter` real implementation for Redis or Upstash behind the same interface. The contract suite verifies it. The cost is roughly half a day plus a new-vendor ADR.
