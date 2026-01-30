---
topic: 03
name: Axes
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/
category: unimplemented
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: [critical/topic-03-axes C-1]
blocks: []
priority: P2
---

# Context: Topic 03 -- Axes (Unimplemented)

## What the Spec Requires

1. **Explicit lift ops**: `broadcastConstToSignal` (zero->one) and `broadcastConstToField` (zero->many) as named IR operations
2. **Var escape check**: All `Axis.kind:'var'` must be resolved to `inst` before backend compilation
3. **Branch-keyed state**: Runtime storage partitioned by branch + instance lane (v1+)
4. **v1+ axis values**: Extended perspective and branch variants (v1+)

## Current State (Topic-Level)

### How It Works Now

Constants are handled as `SigExprConst` (which is in the signal expression domain, implying cardinality=one) and `FieldExprConst` (field domain, implying cardinality=many). There is no intermediate zero-cardinality representation at the IR level. The current approach works but differs from the spec's model where constants start at zero and are explicitly lifted.

No check exists for var axis escape. The type system uses `Axis<T,V>` with var/inst discrimination, but nothing verifies that all vars are resolved before backend lowering.

Branch keying is not implemented (v0 uses single default branch). The runtime state model in `RuntimeState.ts` does not partition by branch.

### Patterns to Follow

- IR expression types (`SigExpr`, `FieldExpr`, `EventExpr`) carry `type: CanonicalType` -- follow this pattern
- `IRBuilder` interface is the construction boundary for IR nodes -- add new ops here
- Validation passes go in `src/compiler/frontend/` -- add var escape check here

## Work Items

### WI-1: Implement zero-cardinality lift operations (or decide current approach is equivalent)
**Category**: UNIMPLEMENTED
**Priority**: P2
**Spec requirement**: Named explicit ops `broadcastConstToSignal` and `broadcastConstToField` for zero->one and zero->many lifts
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/types.ts` | IR expression types | 90-260 |
| `src/compiler/ir/IRBuilder.ts` | Builder interface | all |
| `src/compiler/ir/IRBuilderImpl.ts` | Builder implementation | 118, 282 |
| `src/compiler/backend/lower-blocks.ts` | Block lowering (creates const nodes) | -- |
**Current state**: `sigConst` creates a signal-level const (implicitly one), `fieldConst` creates a field-level const (implicitly many). No zero-cardinality IR representation.
**Required state**: Either (a) add zero-cardinality const expressions + explicit lift ops, or (b) document that SigExprConst/FieldExprConst are the canonical lift ops (they implicitly lift from zero). Option (b) requires updating the spec or adding a design decision record.
**Suggested approach**: Start with option (b) -- document that `sigConst` IS the broadcastConstToSignal and `fieldConst` IS the broadcastConstToField. Add comments in the IR types. If the spec team disagrees, implement option (a) later.
**Depends on**: Critical C-1 (deriveKind must handle zero first)
**Blocks**: none

### WI-2: Add axis var escape check
**Category**: UNIMPLEMENTED
**Priority**: P2
**Spec requirement**: `Axis.kind:'var'` must not escape frontend into backend IR
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/frontend/axis-validate.ts` | Validation pass | all |
| `src/core/canonical-types.ts` | isAxisVar helper | 425-427 |
**Current state**: No check exists. `deriveKind()` would throw on var axes, but it is not systematically called on all types.
**Required state**: A pass that iterates all CanonicalType values in the compiled IR and asserts every axis is `inst`. Can be added to axis-validate.
**Suggested approach**: Add `validateNoVarAxes(types: CanonicalType[])` to axis-validate.ts. For each type, check all 5 axes with `isAxisVar()`. Return violations for any var axes found. Call this during compilation after type inference.
**Depends on**: Critical C-2 (axis-validate integration)
**Blocks**: none

### WI-3: Branch-keyed runtime state (v1+)
**Category**: UNIMPLEMENTED
**Priority**: P5
**Spec requirement**: Invariant I4 -- runtime storage keyed by branch + instance lane
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/runtime/RuntimeState.ts` | State container | all |
**Current state**: Single default branch, no partitioning
**Required state**: State storage partitioned by branch value (v1+)
**Suggested approach**: Deferred. When implementing preview/undo branches, add a BranchValue key to state storage maps. Current single-branch architecture should be designed to not make this impossible.
**Depends on**: v1+ branch axis values
**Blocks**: preview, undo, speculative execution features

### WI-4: v1+ perspective and branch variants
**Category**: UNIMPLEMENTED
**Priority**: P5
**Spec requirement**: Extended perspective (world, view, screen) and branch (main, preview, checkpoint, etc.) values
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | PerspectiveValue, BranchValue | 510-517 |
**Current state**: v0-only `{ kind: 'default' }` for both
**Required state**: Extended union types as specified (v1+)
**Suggested approach**: Deferred. Add variants when needed. The current type system structure (discriminated unions) supports extension cleanly.
**Depends on**: v1+ roadmap
**Blocks**: perspective-aware rendering, branch-based preview/undo
