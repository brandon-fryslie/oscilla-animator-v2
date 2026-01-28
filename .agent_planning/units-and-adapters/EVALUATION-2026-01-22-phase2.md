# Evaluation: Adapter System Phase 2
Generated: 2026-01-22
Topic: units-and-adapters
Source: Audit of unit and adapter system migration

## Current State

### Phase 1 (Unit Type System) — COMPLETE
- `Unit` discriminated union (14 kinds) implemented in `canonical-types.ts`
- `CanonicalType.unit` is mandatory (`readonly unit: Unit`)
- All block definitions use explicit units where semantically required
- Unit mismatches are hard compilation errors
- TypeScript compiles cleanly, 858/863 tests passing

### Phase 2 (Adapter System) — NOT IMPLEMENTED
- Spec written and authoritative: `design-docs/_new/0-Units-and-Adapters.md` Part B
- Adapter infrastructure exists for cardinality (Broadcast only)
- **None** of the 10 required unit-conversion adapter blocks are implemented
- `TypeSignature` in adapter registry lacks `unit` field
- No editor adapter attachment model
- No graph normalization for port-attached adapters
- No adapter UI

## Issues Found

### P1: Dead guard in `isTypeCompatible`
- `pass2-types.ts:77`: `if (from.unit && to.unit && ...)` — unit is mandatory, guard is dead code
- Fix: simplify to `if (from.unit.kind !== to.unit.kind)`

### P1: Dual enforcement — `checkUnitCompatibility` is redundant
- `pass2-types.ts:263-279`: emits `console.warn` for unit mismatches
- But `isTypeCompatible()` already catches the same condition as a hard error
- Violates Single Enforcer principle
- Fix: remove `checkUnitCompatibility` entirely

### P2: `TypeSignature` lacks `unit` field
- `graph/adapters.ts:39-43`: can only match on payload+cardinality+temporality
- Cannot express unit-conversion adapter rules
- Fix: add `unit: Unit['kind'] | 'any'` to TypeSignature (covered in adapter-registry sprint)

### P3: Unused `NumericUnit` import
- `pass2-types.ts:17`: imports `NumericUnit` but doesn't use it
- Fix: remove dead import

## Existing Plans Assessment

| Sprint | Status | Assessment |
|--------|--------|------------|
| unit-system (Sprint 1) | COMPLETE | Fully implemented and passing |
| adapter-registry (Sprint 2) | READY | Plan exists, comprehensive, HIGH confidence |
| Editor UI (Sprint 3) | MISSING | Referenced as "out of scope" in Sprint 2, no plan exists |
| P1 Fixes (Sprint 0) | MISSING | Quick fixes from audit, no plan exists |

## Work Breakdown

### Sprint 0: Quick Fixes (NEW — needs plan)
- Remove dead guard in isTypeCompatible
- Remove redundant checkUnitCompatibility
- Remove unused NumericUnit import
- Confidence: HIGH (trivial changes)

### Sprint 2: Adapter Registry (EXISTS — ready for implementation)
- 10 adapter block definitions
- TypeSignature extension with unit
- Adapter registry rules
- Graph normalization materialization
- Anchor system and stable IDs
- Diagnostics
- Tests

### Sprint 3: Editor Integration (NEW — needs plan)
- AdapterAttachment model in patch/graph
- Auto-insertion algorithm (BFS on conversion graph)
- Editor UI for adapter badges/annotations
- Undo/redo integration
- Confidence: MEDIUM (UI design decisions needed)

## Verdict: CONTINUE

Sprint 2 plan is ready for implementation. Two additional sprints needed: Sprint 0 (quick fixes) and Sprint 3 (editor integration).
