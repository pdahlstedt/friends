# Checklist – social platform

## Phase 0 – Foundation (before any features)

- [ ] GitHub repo: branch protection on `main`, require PR + green checks
- [ ] Dependabot/Renovate, secret scanning and CodeQL enabled
- [ ] Next.js + TypeScript strict, ESLint, Prettier, Vitest, Playwright
- [ ] Module structure `src/modules/*` + `src/lib/adapters/*`
- [ ] Supabase project in EU region (separate projects for dev and prod)
- [ ] Local Supabase via CLI, migrations in git
- [ ] `.env.example`, no secrets in the repo
- [ ] CI: lint, typecheck, tests, build on every PR
- [ ] Security headers + CSP from day one
- [ ] Domain at a registrar you control, DNS via Cloudflare
- [ ] MFA on all accounts: GitHub, Supabase, Stripe, Cloudflare, registrar

## Phase 1 – Users and profiles

- [ ] Sign-up/login (email + OAuth), email verification
- [ ] Turnstile on sign-up and login
- [ ] Rate limiting on auth
- [ ] Profiles table with RLS (read: public/configurable, write: owner only)
- [ ] Profile page + edit, Zod validation
- [ ] Avatar upload (validation, EXIF stripping, size limit)
- [ ] Test: RLS enabled on all tables

## Phase 2 – Photos

- [ ] Private storage bucket, signed URLs
- [ ] Image optimization/thumbnails
- [ ] CSAM hash scanning (e.g. Cloudflare CSAM Scanning Tool)
- [ ] Report button on images

## Phase 3 – Chat

- [ ] Data model: conversations, participants, messages (RLS: participants only)
- [ ] Realtime subscription via adapter
- [ ] Rate limiting on messages, block users
- [ ] Report message

## Phase 4 – Admin and moderation

- [ ] Roles (user, moderator, admin) enforced server-side
- [ ] `/admin` behind Cloudflare Access + MFA
- [ ] Report queue, actions (hide, delete, suspend account)
- [ ] Audit log for all admin actions
- [ ] Moderation decisions logged with reason (DSA)

## Phase 5 – Subscriptions

- [ ] Stripe Checkout + Customer Portal
- [ ] Webhook with signature verification and idempotency
- [ ] Subscription status in own DB, Stripe customer ID stored
- [ ] Features gated server-side on subscription status
- [ ] Test mode fully exercised (payment, cancellation, failed payment)

## Phase 6 – Ads

- [ ] Own ad slots + ads table managed in admin
- [ ] No third-party tracking without consent (add a CMP if that changes)

## Before launch

- [ ] Privacy policy, terms of service, cookie notice
- [ ] GDPR: account export and deletion work end-to-end
- [ ] Data processing agreements: Supabase, Stripe, Cloudflare, Vercel
- [ ] Cloudflare WAF rules and rate limiting in prod
- [ ] Backups/point-in-time recovery + tested restore
- [ ] Error monitoring (e.g. Sentry) with no personal data in logs
- [ ] Security review: have Claude Code review RLS, auth and uploads; external pentest later
- [ ] Billing alerts at all providers
- [ ] `security.txt` and a process for receiving vulnerability reports
