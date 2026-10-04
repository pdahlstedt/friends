---
description: Implement the next open task of a spec
argument-hint: <spec id>
---

Implement the next unchecked task in `docs/specs/$ARGUMENTS-*/tasks.md`.

1. Re-read the spec and plan. Implement only what they describe.
2. Write tests first where practical (unit, contract, RLS as the task requires).
3. Implement. Follow all rules in `CLAUDE.md` (module boundaries, adapters, security).
4. Run `pnpm lint && pnpm typecheck && pnpm test` plus the integration suites the task touches. Unit coverage must stay at 100%.
5. Tick the task, commit with a Conventional Commit referencing [$ARGUMENTS].
6. Report what was done and what is next. Stop after one task unless I say continue.
