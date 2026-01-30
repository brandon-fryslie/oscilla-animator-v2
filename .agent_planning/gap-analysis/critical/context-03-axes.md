---
topic: 03
name: Axes
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/
category: critical
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: [topic-03-unimplemented]
priority: P1
---

# Context: Topic 03 -- Axes (Critical)

## What the Spec Requires

1. **5-axis extent system**: cardinality, temporality, binding, perspective, branch -- all independent, all on every CanonicalType
2. **I1 - Single Authority**: Instance identity lives ONLY in `extent.cardinality` as `many(instanceRef)`, no separate `instanceId` field
3. **I2 - Only Explicit Ops Change Axes**: Broadcast, Reduce, State ops, Adapters -- nothing else changes axes
4. **I3 - Centralized Enforcement**: One validation gate (`validateAxes`) decides IR validity; no bypass for debug/preview/partial
5. **I4 - State Scoped by Axes**: Runtime storage keyed by branch + instance lane
6. **I5 - Const Matches Payload**: `ConstValue.kind` must match `CanonicalType.payload.kind`, validated by `constValueMatchesPayload()`
7. **Cardinality**: `zero` (compile-time only), `one` (signal), `many(instance)` (field) -- zero is NOT signal
8. **Temporality**: `continuous` (every frame), `discrete` (event ticks only) -- discrete implies payload=bool, unit=none
9. **Binding**: 4 nominal tags (unbound/weak/strong/identity) with NO ordering, NO lattice, NO join/meet. Mismatch during unification is type error.
10. **Perspective**: v0 = `{ kind: 'default' }` only
11. **Branch**: v0 = `{ kind: 'default' }` only
12. **Vars are inference-only**: `Axis.kind: 'var'` must not escape frontend into backend IR
13. **deriveKind is total**: Must handle all cardinality/temporality combinations deterministically

## Current State (Topic-Level)

### How It Works Now

The 5-axis type system is structurally implemented in `src/core/canonical-types.ts`. All five axes exist on `Extent`, each using the `Axis<T,V>` var/inst discriminated union. Canonical constructors (`canonicalSignal`, `canonicalField`, `canonicalEventOne`, `canonicalEventField`) correctly set axes. `BindingValue` correctly has 4 nominal tags with no ordering. `InstanceRef` correctly lives only inside `CardinalityValue.many`.

However, enforcement is incomplete: `axis-validate.ts` exists but is never called, `deriveKind()` treats zero-cardinality as signal, `constValueMatchesPayload()` is defined but unused, and `DEFAULTS_V0` uses wrong types for perspective/branch.

### Patterns to Follow

- `Axis<T,V>` pattern for var/inst discrimination -- well established, follow it
- `axisInst()` / `axisVar()` constructors -- use these, never construct raw objects
- Canonical constructors enforce event invariants at construction time (good)
- `unifyAxis()` correctly treats binding mismatches as errors (no lattice)

## Work Items

### WI-1: Fix deriveKind() to handle cardinality=zero
**Category**: CRITICAL
**Priority**: P1
**Spec requirement**: Cardinality zero means compile-time-only, NOT signal. deriveKind must be total over all cardinality values.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | deriveKind definition | 696-715 |
| `src/compiler/frontend/axis-validate.ts` | Consumer of deriveKind | 60-68 |
| `src/core/__tests__/canonical-types.test.ts` | Tests | all |
**Current state**: `deriveKind` returns `'signal'` for both `one` and `zero` cardinality. `DerivedKind` has no `'const'` variant.
**Required state**: Either add `'const'` to `DerivedKind` and handle zero explicitly, or decide that zero-cardinality types should never reach deriveKind (and add a guard). The spec says zero is a valid cardinality, so deriveKind must handle it.
**Suggested approach**: Add `'const'` to the `DerivedKind` union. In `deriveKind`, after checking discrete, check `card.value.kind === 'zero'` and return `'const'`. Update `axis-validate.ts` to handle const-kind types (they should not require signal/field/event assertions). Update all switch/if-else chains that use `deriveKind`.
**Depends on**: none
**Blocks**: WI-2 (axis-validate integration)

### WI-2: Integrate axis-validate into compile pipeline
**Category**: CRITICAL
**Priority**: P1
**Spec requirement**: Invariant I3 -- exactly one enforcement gate, no bypass
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/frontend/axis-validate.ts` | Validation pass | all |
| `src/compiler/compile.ts` | Compile pipeline | 1-50 |
**Current state**: `axis-validate.ts` exports `validateTypes()` but nothing imports it. The compile pipeline has no axis validation step.
**Required state**: After type resolution (pass 2), call `validateTypes()` on all resolved types. If violations found, emit compile errors and abort.
**Suggested approach**: Import `validateTypes` in `compile.ts`. After the type graph pass resolves all types, collect them and run validation. Convert `AxisViolation[]` to compile errors using the existing diagnostic conversion system. Must fix WI-1 first since validateType calls deriveKind.
**Depends on**: WI-1
**Blocks**: Full enforcement of spec invariants

### WI-3: Fix DEFAULTS_V0 perspective/branch types
**Category**: CRITICAL
**Priority**: P2
**Spec requirement**: Perspective is `{ kind: 'default' }`, Branch is `{ kind: 'default' }` -- not strings
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | DEFAULTS_V0 / FRAME_V0 definitions | 890-905 |
| `src/core/__tests__/canonical-types.test.ts` | Tests asserting wrong values | 219-237 |
| `src/ui/reactFlowEditor/typeValidation.ts` | Consumer | 78-79, 110-111, 199-202 |
| `src/compiler/frontend/analyze-type-graph.ts` | Consumer | 56-59, 183-186 |
**Current state**: `DEFAULTS_V0.perspective = 'global'` (string), `DEFAULTS_V0.branch = 'main'` (string). Tests assert these string values.
**Required state**: `perspective: { kind: 'default' } as PerspectiveValue`, `branch: { kind: 'default' } as BranchValue`. Update all consumers and tests.
**Suggested approach**: Change the type and value, then fix type errors that cascade. Current consumers only use cardinality/temporality from DEFAULTS_V0, so impact should be limited.
**Depends on**: none
**Blocks**: none (consumers don't currently read perspective/branch from DEFAULTS_V0)

### WI-4: Wire up constValueMatchesPayload enforcement
**Category**: CRITICAL
**Priority**: P2
**Spec requirement**: Invariant I5 -- ConstValue.kind must match CanonicalType.payload.kind
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | constValueMatchesPayload definition | 315-320 |
| `src/compiler/ir/IRBuilderImpl.ts` | sigConst / fieldConst methods | 118, 282 |
**Current state**: `constValueMatchesPayload()` exists but is never called. `sigConst()` and `fieldConst()` accept ConstValue + CanonicalType without checking they match.
**Required state**: Both `sigConst()` and `fieldConst()` validate that `constValue.kind === type.payload.kind` at construction time. Alternatively, add to axis-validate pass.
**Suggested approach**: Add a check in `IRBuilderImpl.sigConst()` and `IRBuilderImpl.fieldConst()`: `if (!constValueMatchesPayload(type.payload, value)) throw new Error(...)`. This is the single enforcement point for I5.
**Depends on**: none
**Blocks**: none

### WI-5: Fix 6 broken canonical type tests
**Category**: CRITICAL
**Priority**: P1
**Spec requirement**: Tests must pass to enforce invariants (spec requirement I3 + project CLAUDE.md testing rules)
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/core/__tests__/canonical-types.test.ts` | Test file | 190, 290-291, 328-329, 353, 359, 365, 367, 382, 388, 404 |
**Current state**: 6 tests fail. Expectations use `'instantiated'` and `'default'` for axis `.kind`, but actual discriminant is `'inst'`. Line 190 expects `canonicalType(FLOAT).extent.cardinality.kind` to be `'default'` but it is `'inst'`.
**Required state**: All tests pass with correct discriminant values.
**Suggested approach**: Replace `'instantiated'` with `'inst'` in all assertions. Replace `'default'` with `'inst'` where the test checks an axis kind on a fully-constructed type (not axis value kind). Line 190 should expect `'inst'` since `canonicalType()` produces instantiated axes. Lines 365/367 checking `binding.kind`, `perspective.kind`, `branch.kind` should expect `'inst'` (the axis discriminant), not `'default'` (which would be the value inside the axis).
**Depends on**: none
**Blocks**: All other test-dependent work
