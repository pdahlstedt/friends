---
description: "Create a feature spec using this repository's spec-driven workflow"
argument-hint: '<slice description>'
agent: 'agent'
---

Create a feature spec for: ${input:slice description}

This repository uses its own spec-driven workflow. Do not invoke or delegate to GSD, and do not use a GSD spec template or process.

1. Read `docs/product/vision.md`, `docs/product/story-map.md`, and `docs/architecture/overview.md`.
2. Find the next free spec number in `docs/specs/`, checking existing spec folders and the story-map index.
3. Create `docs/specs/NNNN-<slug>/` from `docs/specs/_template/` and fill in `spec.md` only:
   - user value and acceptance criteria in Given/When/Then format with IDs
   - denied and abuse paths, and `@regression` tags for user-visible criteria
   - security and privacy impact, out of scope, and open questions
4. If the slice is too large (more than about five days), propose a split by user value and stop without creating a spec.
5. Add the new spec to the index in `docs/product/story-map.md` with status `Draft`.
6. Show the completed draft and list open questions. Do not write a plan or code, and do not set the status to `Approved`; the user approves it.
