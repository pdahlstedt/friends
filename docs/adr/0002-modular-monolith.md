# ADR-0002: Modular monolith

- Status: Accepted
- Date: 2026-10-04

## Context
Small team, low budget, security as top priority. Module boundaries are not yet proven by real usage. Some parts (chat, media processing) may later need independent scaling.

## Decision
We will build a single Next.js application organised as modules under `src/modules/<name>/`. Each module:
- exposes its public API only through `index.ts`, typed by `contract.ts`;
- owns its own tables (own Postgres schema where practical);
- is covered by contract tests that pin its public behaviour.

Cross-module imports of internals are blocked by an ESLint boundaries rule. Vendor SDKs are only used inside `src/lib/adapters/`.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Microservices from day one | Independent scaling and deploys | High cost, larger attack surface, distributed complexity, boundaries likely wrong |
| Unstructured monolith | Fastest start | Hard to split later, tangled data access |

## Consequences
- One deploy, one attack surface to harden, cheap to run.
- Extraction later is mostly mechanical: a module with its own schema and contract tests can move behind a network API, and the contract suite verifies the new service.
- Requires discipline; enforced by lint rules and review.

## Exit strategy
Extract a module (likely chat first) into a separate service when a concrete scaling or isolation need appears; record it in a new ADR.
