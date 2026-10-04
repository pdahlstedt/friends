# Contributing

## Workflow

1. Pick the next slice from `docs/product/story-map.md`.
2. Write the spec (`/spec` in Claude Code) → get it approved.
3. Plan (`/plan`) → ADR if a significant decision is involved.
4. Implement task by task (`/implement`), test first.
5. Verify (`/verify`) → open PR.

## Branches

Trunk-based development. `main` is protected and always releasable.

```
feat/0003-avatar-upload
fix/0007-chat-rate-limit
docs/adr-0004-image-cdn
```

Branches live hours to a few days. Rebase on `main` before opening a PR.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), scope = module, spec ID in brackets:

```
feat(media): validate magic bytes on upload [0003]
test(rls): deny profile update by other user [0003]
docs(adr): ADR-0004 serve images via separate domain
security(users): rate-limit password reset [0009]
```

One logical change per commit; each commit passes `pnpm verify`. Sign commits (SSH or GPG signing).

## Pull requests

- Squash-merged into `main`; PR title becomes the commit message (Conventional Commit format).
- Must pass: lint, typecheck, unit (100% coverage), contract, RLS, system regression, CodeQL, secret scanning.
- Docs (spec traceability, architecture) updated in the same PR.
- At least one review (human review required for anything touching auth, RLS, billing, uploads or admin).

## Releases

Tag `main` with semantic versions (`v0.3.0`) when deploying to production; changelog generated from commits.

## Never

- Commit secrets or `.env` files.
- Force-push `main` or rewrite published history.
- Skip, disable or weaken tests, lint rules or coverage thresholds to get green.
