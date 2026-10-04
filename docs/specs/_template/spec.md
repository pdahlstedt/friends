# NNNN — <Title>

|           |                        |
| --------- | ---------------------- |
| Status    | Draft                  |
| Story map | <Release / activity>   |
| Modules   | <e.g. profiles, media> |
| ADRs      | <links, if any>        |

## User value

As a <role>, I want <capability>, so that <benefit>.

<!-- Why now? What do we learn or unlock by shipping this slice? -->

## Acceptance criteria

<!-- Given/When/Then. Each criterion gets an ID. Tag user-visible ones @regression. -->

- **AC1** @regression — Given …, when …, then …
- **AC2** — Given …, when …, then …
- **AC3** (denied path) — Given a user who is not the owner, when …, then access is denied and nothing changes.

## Security & privacy

- Data touched (personal data?):
- Who may read / write (roles):
- Threats considered (abuse, enumeration, injection, upload, IDOR, rate limiting):
- GDPR / DSA impact (export, deletion, reporting):

## Out of scope

-

## Open questions

-

## Traceability

<!-- Filled in during Verify. Every AC must have at least one automated test. -->

| AC  | Test level | Test file / name              |
| --- | ---------- | ----------------------------- |
| AC1 | system     | `tests/system/…spec.ts` › …   |
| AC1 | unit       | `src/modules/…/….test.ts` › … |
