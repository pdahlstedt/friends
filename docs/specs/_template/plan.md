# NNNN — Plan

## Approach
<!-- Short description of how the spec is implemented. -->

## Modules and interfaces
| Module | Change | Public interface change (`contract.ts`) |
|---|---|---|
| | | |

## Data model
<!-- Tables/columns, owning module/schema, migration name. -->

### RLS policies
| Table | anon | user (own) | user (other) | moderator | admin |
|---|---|---|---|---|---|
| | | | | | |

## Adapters
<!-- New or changed adapter interfaces; fake + real implementation. -->

## Security controls
<!-- Concrete controls answering the threats listed in the spec. -->

## Test plan
| Level | What | Location |
|---|---|---|
| Unit (100%) | Domain logic, validation, branches | `src/modules/<m>/**/*.test.ts` |
| Contract | Module API / adapter behaves per interface (fake + real) | `tests/contracts/` |
| RLS | Allowed/denied per role for each new table | `tests/rls/` |
| System | Each `@regression` AC end to end | `tests/system/` |

## ADRs needed
<!-- None, or list. -->

## Risks
-
