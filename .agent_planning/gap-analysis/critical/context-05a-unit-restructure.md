---
topic: 05a
name: Migration - UnitType Restructure
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t2_unit-restructure.md
category: critical
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: ["topic-05b (adapter restructure depends on structured units)"]
priority: P2
---

# Context: Topic 05a — UnitType Restructure (Critical)

## What the Spec Requires

1. UnitType reduced from 16+ flat kinds to 8 structured kinds.
2. New structured kinds: `none`, `scalar`, `norm01`, `count`, `angle{unit}`, `time{unit}`, `space{space,dims}`, `color{space}`.
3. `angle` groups: radians, degrees, phase01.
4. `time` groups: ms, seconds.
5. `space` groups: ndc/world/view x 2/3 dims.
6. `color` groups: rgba01.
7. `{ kind: 'var' }` completely removed from UnitType (inference-only).
8. `unitsEqual()` must handle structured comparison (not just `kind` equality).

## Current State (Topic-Level)

### How It Works Now
UnitType in `src/core/canonical-types.ts:44-59` is a flat union of 15 literal kinds. Each kind has a corresponding constructor function (`unitPhase01()`, `unitRadians()`, etc.). Equality comparison in `unitsEqual()` simply checks `a.kind === b.kind`. The `unitVar()` function is correctly removed (throws `never`). Adapter rules in `src/graph/adapters.ts` match on flat kinds directly.

### Patterns to Follow
- Constructors are simple factory functions returning readonly objects
- Singleton constants exist for PayloadType (FLOAT, VEC2, etc.) — same pattern could apply to common units
- The ALLOWED_UNITS map validates payload-unit combinations

## Work Items

### WI-1: Restructure UnitType to 8 structured kinds
**Category**: CRITICAL
**Priority**: P2
**Spec requirement**: 8 structured kinds with sub-parameters instead of 16+ flat kinds.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | UnitType definition + constructors | 44-76 |
| `src/core/canonical-types.ts` | `unitsEqual()` comparison | 91-94 |
| `src/core/canonical-types.ts` | `ALLOWED_UNITS` map | 98-108 |
| `src/core/canonical-types.ts` | `isValidPayloadUnit()` | 113-121 |
| `src/core/canonical-types.ts` | `defaultUnitForPayload()` | 128-148 |
| `src/graph/adapters.ts` | All adapter rules (10 rules) | 102-258 |
| 57+ files | All consumers of UnitType | various |
**Current state**: Flat union with 15 variants, simple kind equality.
**Required state**: Structured union with 8 kinds, deep equality for structured kinds.
**Suggested approach**:
1. Redefine UnitType as the 8-kind structured union.
2. Update constructors to return structured objects (e.g., `unitRadians()` returns `{ kind: 'angle', unit: 'radians' }`).
3. Update `unitsEqual()` to perform deep structural comparison.
4. Update `ALLOWED_UNITS` to map PayloadKind to structured unit patterns.
5. Update adapter rules to use structured unit matching.
6. Run full test suite to catch all breakage. This is a big-bang change — no incremental path.
**Depends on**: none
**Blocks**: Adapter restructure (WI-2)

### WI-2: Remove deg/degrees duplication
**Category**: CRITICAL
**Priority**: P2 (part of WI-1)
**Spec requirement**: Single representation for degrees.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | `deg` and `degrees` variants | 49-51 |
**Current state**: Two separate kinds for the same concept.
**Required state**: Single `{ kind: 'angle', unit: 'degrees' }`.
**Suggested approach**: Resolve as part of WI-1. Grep for all `'deg'` unit usage and migrate to `'degrees'`.
**Depends on**: WI-1
**Blocks**: none
