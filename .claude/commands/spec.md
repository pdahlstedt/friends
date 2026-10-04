---
description: Create a new feature spec from the story map
argument-hint: <slice description>
---

Create a spec for: $ARGUMENTS

1. Read `docs/product/vision.md`, `docs/product/story-map.md` and `docs/architecture/overview.md`.
2. Find the next free spec number in `docs/specs/`.
3. Copy `docs/specs/_template/` to `docs/specs/NNNN-<slug>/` and fill in `spec.md` only:
   - user value, acceptance criteria in Given/When/Then with IDs, including denied/abuse paths
   - tag user-visible ACs `@regression`
   - security & privacy section, out of scope, open questions
4. If the slice is too large (> ~5 days), propose a split along user value and stop.
5. Add the spec to the index in `story-map.md` with status Draft.
6. Show me the spec and list open questions. Do not write plan or code. Do not set status Approved — I do that.
