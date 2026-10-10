# ADR-0001: Record architecture decisions

- Status: Accepted
- Date: 2026-10-04

## Context

The project is built incrementally, largely with an AI coding assistant. Decisions made early must remain understandable months later, by humans and by Claude Code reading the repo.

## Decision

We will record significant architectural decisions as ADRs in `docs/adr/`, numbered sequentially, using `0000-template.md`. A decision is significant if it affects module boundaries, data ownership, security posture, vendors/cost, or is expensive to reverse.

Accepted ADRs are immutable except for their status. Changing a decision means writing a new ADR that supersedes the old one.

## Consequences

- Rationale is versioned with the code and reviewed in PRs.
- Small overhead per decision.

## Exit strategy

None needed.
