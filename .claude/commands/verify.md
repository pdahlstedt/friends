---
description: Verify a spec is fully implemented and tested
argument-hint: <spec id>
---

Verify spec $ARGUMENTS.

1. For every AC in `spec.md`, find the automated tests that prove it. Fill the traceability table. Any AC without a test is a failure — write the missing test.
2. Every `@regression` AC must have a Playwright test in `tests/system/` titled `[$ARGUMENTS-ACn] …`.
3. Run `pnpm verify`. All green, 100% unit coverage, no new coverage ignores.
4. Security review of the diff against `main`: RLS, authz on mutations, input validation, secrets, logging of personal data, uploads, rate limits. List findings.
5. Update `docs/architecture/overview.md` if modules, interfaces or adapters changed.
6. Set spec status Done, update the story-map index, commit `docs(specs): verify [$ARGUMENTS]`.
7. Draft the PR description using `.github/pull_request_template.md`.
