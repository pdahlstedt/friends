---
description: Write plan.md and tasks.md for an approved spec
argument-hint: <spec id, e.g. 0003>
---

Plan spec $ARGUMENTS.

1. Read `docs/specs/$ARGUMENTS-*/spec.md`. If status is not Approved, stop and tell me.
2. Read `CLAUDE.md`, `docs/architecture/overview.md`, relevant ADRs and the affected modules' `contract.ts`.
3. Fill `plan.md`: modules and interface changes, data model, RLS matrix, adapters, security controls per threat, test plan per level.
4. If a significant architectural decision is needed, draft an ADR (status Proposed) and stop for my review.
5. Fill `tasks.md` with small tasks, each committable and green, referencing AC IDs.
6. Commit as `docs(specs): plan [$ARGUMENTS]` on branch `feat/$ARGUMENTS-<slug>`.
