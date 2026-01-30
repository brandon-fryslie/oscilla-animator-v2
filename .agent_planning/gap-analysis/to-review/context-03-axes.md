---
topic: 03
name: Axes
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/
category: to-review
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
priority: P3
---

# Context: Topic 03 -- Axes (To-Review)

## What the Spec Requires

1. **Binding unification**: Mismatched instantiated bindings = type error OR explicit adapter required
2. **EventRead pattern**: Output is `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })` -- continuous float signal, NOT an event

## Current State (Topic-Level)

### How It Works Now

Binding unification via `unifyAxis()` correctly rejects mismatched instantiated values by throwing `AxisUnificationError`. This matches the spec's "type error" semantics. No binding adapters exist yet (v0 scope).

EventRead expressions carry a `type: CanonicalType` field populated by callers. The spec requires this to always be a continuous float signal, but enforcement is delegated to callsites rather than enforced at the IR builder level.

### Patterns to Follow

- `unifyAxis` is the single unification point -- keep it
- IR builder should validate types at construction where possible
- Event invariants are enforced by canonical constructors (`canonicalEventOne`, etc.)

## Work Items

### WI-1: Review binding unification diagnostic quality
**Category**: TO-REVIEW
**Priority**: P3
**Spec requirement**: Binding mismatch should suggest adapters (or clearly state it's an error)
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | unifyAxis | 985-1000 |
| `src/compiler/diagnosticConversion.ts` | Error formatting | -- |
**Current state**: Generic `AxisUnificationError` thrown with axis name and values. No adapter suggestion.
**Required state**: For v0 this is acceptable. For v1+, binding adapters may need to be suggested.
**Suggested approach**: No immediate action. When binding adapters are implemented, update the unification error path to check for available adapters before erroring.
**Depends on**: none
**Blocks**: none

### WI-2: Audit eventRead type construction
**Category**: TO-REVIEW
**Priority**: P3
**Spec requirement**: eventRead output must be continuous float signal (canonicalSignal(FLOAT, unitScalar()))
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/IRBuilderImpl.ts` | eventRead construction | 871 |
| `src/compiler/ir/types.ts` | SigExprEventRead interface | 178-183 |
| `src/compiler/backend/lower-blocks.ts` | Callers | -- |
**Current state**: Type passed by caller, not enforced at builder level.
**Required state**: Either enforce at builder level (assert canonicalSignal with float+scalar) or verify all callers.
**Suggested approach**: Add an assertion in the eventRead builder method that the type is a continuous float signal. This is a defense-in-depth check.
**Depends on**: none
**Blocks**: none
