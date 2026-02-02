# User Response: ValueContract Migration Plan
Date: 2026-02-01

## Decision: APPROVED (all 3 sprints)

### Approved Sprints
1. **SPRINT-20260201-core-types** — Add ValueContract type + CanonicalType integration
2. **SPRINT-20260201-migrate-refs** — Remove norm01, rename phase01→turns, migrate all references
3. **SPRINT-20260201-new-lenses** — New contract-based adapter and lens blocks

### Design Decisions
- `contract` lives on `CanonicalType` (optional field)
- Adapter auto-insertion fires on contract mismatches
- No contract inference — explicit declarations only
- Compatibility: strong→weak OK, weak→strong needs adapter
- Angle unit `phase01` renamed to `turns`
- ValueContract initial kinds: none, clamp01, wrap01, clamp11
