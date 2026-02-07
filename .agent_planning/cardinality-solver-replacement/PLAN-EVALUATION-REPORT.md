# Cardinality Solver Replacement Plan - Evaluation Report

**Date**: 2026-02-06
**Evaluator**: project-evaluator agent
**Git Commit**: 95177cf
**Branch**: bmf_type_system_refactor

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Plan Completeness** | 65% |
| **Critical Issues** | 4 |
| **Blocking Questions** | 3 |
| **Recommendation** | **PAUSE** - Clarify before implementation |

The cardinality solver replacement plan is **architecturally sound** in its overall design. The constraint-graph approach aligns with the spec document (`design-docs/cardinality-solver.md`) and is the correct design choice. However, **4 critical gaps** would cause implementation to fail or require significant rework mid-stream.

---

## Plan Overview

### Objective
Replace the current cardinality solver with a constraint-graph-based approach that:
- Eliminates placeholder hacks
- Properly handles instance variables
- Produces targeted diagnostics

### Proposed Changes

| Step | Description | Files |
|------|-------------|-------|
| 1 | Add `InstanceVarId` and `InstanceTerm` | `ids.ts`, `cardinality.ts`, `instance-ref.ts` |
| 2 | Add constraint graph types | NEW: `cardinality-constraints.ts` |
| 3 | Build constraint graph from block metadata | `analyze-type-constraints.ts` |
| 4 | Implement new solver | `solve-cardinality.ts` (rewrite) |
| 5 | Wire solver into pipeline | `analyze-type-constraints.ts` |
| 6 | Add diagnostic codes | `types.ts`, `frontendDiagnosticConversion.ts` |
| 7 | Update tests | `solve-cardinality-trace.test.ts` |
| 8 | Delete dead code | `solve-cardinality.ts` |
| 9 | End-to-end verification | Manual + automated |

---

## Critical Issues

### Issue 1: Type System Violation (Step 1)

**Severity**: CRITICAL
**Status**: Blocks implementation

#### Problem

The plan proposes changing `CardinalityValue.many.instance` from `InstanceRef` to `InstanceTerm`:

```typescript
// PROPOSED (problematic)
export type CardinalityValue =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InstanceTerm };  // ← InstanceTerm has 'var' variant
```

This violates `TYPE-SYSTEM-INVARIANTS.md` rule 4:

> **"Vars Are Inference-Only"**
> DO NOT let Axis.kind:'var' escape the frontend boundary into backend/runtime/renderer.

#### Evidence

The `InstanceTerm` type includes a `var` variant:

```typescript
export type InstanceTerm =
  | { readonly kind: 'inst'; readonly ref: InstanceRef }
  | { readonly kind: 'var'; readonly id: InstanceVarId };  // ← var can escape!
```

If `CardinalityValue` contains `InstanceTerm`, then vars can escape into:
- Backend compilation
- Runtime execution
- UI rendering

#### Breaking Changes

**14+ call sites** access `.instance.domainTypeId` and `.instance.instanceId` directly. These would fail at runtime when `instance.kind === 'var'`:

| File | Lines | Access Pattern |
|------|-------|----------------|
| `src/core/canonical-types/equality.ts` | 30-31 | `.instance.domainTypeId`, `.instance.instanceId` |
| `src/compiler/frontend/solve-cardinality.ts` | 128, 135, 158 | `.instance.instanceId` |
| `src/ui/reactFlowEditor/typeValidation.ts` | 185 | `.instance.domainTypeId` |
| `src/ui/graphEditor/portTooltipFormatters.ts` | 69 | `.instance.instanceId` |
| `src/blocks/signal/default-source.ts` | 241 | `.instance` access |
| `src/blocks/lens/construct.ts` | 59, 71, 83 | `.instance.instanceId` |

#### Recommendation

**Do not change `CardinalityValue.instance` to `InstanceTerm`.**

Instead, create a separate inference-layer type:

```typescript
// In src/compiler/frontend/inference-types.ts (NEW file)

import type { InstanceRef } from '../../core/canonical-types';
import type { InstanceVarId } from '../../core/ids';

/**
 * Instance term used ONLY during inference.
 * Must be resolved to InstanceRef before leaving frontend.
 */
export type InferenceInstanceTerm =
  | { readonly kind: 'inst'; readonly ref: InstanceRef }
  | { readonly kind: 'var'; readonly id: InstanceVarId };

/**
 * Cardinality value used ONLY during inference.
 * Must be resolved to CardinalityValue before leaving frontend.
 */
export type InferenceCardinalityValue =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InferenceInstanceTerm };
```

The solver works with `InferenceCardinalityValue` internally, then validates all vars are resolved before outputting `CardinalityValue`.

---

### Issue 2: Missing Instance Unification Algorithm (Step 4)

**Severity**: CRITICAL
**Status**: Blocks implementation

#### Problem

The plan mentions instance variable unification but provides no algorithm:

```typescript
// Plan shows this declaration...
const instanceUF = new UnionFind<InstanceVarId, InstanceRef>();

// ...but no algorithm for:
// - How InstanceVarId values are unified
// - How a var resolves to concrete when connected to a concrete ref
// - What happens on two-different-concrete conflict
```

#### Evidence

Current `UnionFind<T>` in `analyze-type-constraints.ts` has a **single type parameter**:

```typescript
class UnionFind<T> {
  private parent = new Map<T, T>();
  // ...
}
```

The plan assumes a two-parameter UnionFind that doesn't exist.

#### Missing Specification

The algorithm must answer:

1. **Initialization**: When a new `InstanceVarId` is created, what is its initial state?

2. **Unification with concrete**: When node A has `iv0` (var) and node B has `instanceRef(circle, block-0)` (concrete), and they're connected by an edge with `policy: 'equal'`:
   - How does `iv0` get resolved to `instanceRef(circle, block-0)`?
   - How does that resolution propagate to all other nodes sharing `iv0`?

3. **Unification of two vars**: When node A has `iv0` and node B has `iv1`, and they're connected:
   - Do they merge into one equivalence class?
   - Which id survives?

4. **Conflict detection**: When `iv0` is already resolved to `instanceRef(circle, block-0)` and then connected to `instanceRef(grid, block-1)`:
   - How is the conflict detected?
   - What diagnostic is emitted?

5. **Termination**: When does propagation stop? How is a fixed point detected?

#### Recommendation

Add a new section to the plan: **"Instance Variable Unification Algorithm"**

```markdown
## Instance Variable Unification Algorithm

### Data Structures

```typescript
// Var → either another var (union) or concrete ref (resolved)
type VarResolution =
  | { kind: 'unresolved' }
  | { kind: 'unified'; with: InstanceVarId }
  | { kind: 'resolved'; ref: InstanceRef };

const varState = new Map<InstanceVarId, VarResolution>();
```

### Operations

1. **fresh(id)**: Create new var with `{ kind: 'unresolved' }`

2. **find(id)**: Follow chain to find representative
   - If unresolved, return id
   - If unified, recursively find(with)
   - If resolved, return the ref

3. **unify(a, b)**: Merge two vars or resolve
   - If both unresolved: pick canonical representative
   - If one resolved: propagate to other
   - If both resolved with same ref: OK
   - If both resolved with different refs: CONFLICT ERROR

4. **resolve(id, ref)**: Set var to concrete
   - Follow find(id) to representative
   - If unresolved: set to resolved(ref)
   - If already resolved same: OK
   - If already resolved different: CONFLICT ERROR
```

---

### Issue 3: Nonexistent Function Reference (Step 3)

**Severity**: CRITICAL
**Status**: Code will not compile

#### Problem

The plan references a function that doesn't exist:

```typescript
const instanceRef = createBlockInstanceRef(block, blockIndex, meta.domainType);
```

Grep for `createBlockInstanceRef` returns no matches.

#### Evidence

Current code creates instance refs inline at `src/compiler/frontend/analyze-type-constraints.ts:445-446`:

```typescript
const ref: InstanceRef = {
  domainTypeId: domainTypeId(domainType),
  instanceId: instanceId(`${blockIndex}`),
};
```

#### Recommendation

Either:

**Option A**: Add the helper function explicitly to Step 3:

```typescript
// Add to src/compiler/frontend/analyze-type-constraints.ts

function createBlockInstanceRef(
  blockIndex: BlockIndex,
  domainType: string,
): InstanceRef {
  return {
    domainTypeId: domainTypeId(domainType),
    instanceId: instanceId(`${blockIndex}`),
  };
}
```

**Option B**: Use the existing inline pattern in the plan's code.

---

### Issue 4: Inadequate Test Coverage (Step 7)

**Severity**: CRITICAL
**Status**: No regression baseline

#### Problem

The plan says "Add new test cases" but:

1. **Current tests are inadequate**: `solve-cardinality-trace.test.ts` only tests trace output format, not solver correctness
2. **No regression baseline**: No tests verify current behavior that must be preserved
3. **Instance tests are wrong layer**: `instance-unification.test.ts` tests IR builder, not solver

#### Evidence

Current test file `solve-cardinality-trace.test.ts`:

```typescript
it('should produce trace output', () => {
  // Tests that trace mode produces output
  // Does NOT test that solutions are correct
});
```

#### Recommendation

**Before Step 4** (rewriting solver), add correctness tests:

```typescript
// src/compiler/frontend/__tests__/solve-cardinality-correctness.test.ts

describe('cardinality solver correctness', () => {
  describe('signal-only blocks', () => {
    it('forces all ports to cardinality one', () => {
      const patch = createPatchWithTimeBlock();
      const result = compileFrontend(patch);
      const timeOut = getPortType(result, 'time-0', 'out');
      expect(timeOut.extent.cardinality).toEqual({ kind: 'inst', value: { kind: 'one' } });
    });
  });

  describe('transform blocks', () => {
    it('outputs many with block-specific instance', () => {
      const patch = createPatchWithArrayBlock();
      const result = compileFrontend(patch);
      const arrayOut = getPortType(result, 'array-0', 'positions');
      expect(arrayOut.extent.cardinality.value.kind).toBe('many');
      expect(arrayOut.extent.cardinality.value.instance.instanceId).toBe('0');
    });
  });

  describe('zip broadcast', () => {
    it('propagates many through compatible inputs', () => {
      // Array → Add(signal) → output is many
    });

    it('errors on incompatible instance refs', () => {
      // Array(circle) + Array(grid) → error
    });
  });

  describe('preserve blocks', () => {
    it('maintains cardinality equality across ports', () => {
      // Math block: input many → output many with same instance
    });
  });
});
```

---

## Minor Issues

### Issue 5: Diagnostic Code Typo (Step 6)

**Severity**: Low
**Location**: Step 6 diagnostic mappings

```typescript
// WRONG
IllegalOneToMany: 'E_ILLEGAL_ONE_TO_TO_MANY',  // Double "TO"

// CORRECT
IllegalOneToMany: 'E_ILLEGAL_ONE_TO_MANY',
```

### Issue 6: Unused Edge Policy (Step 2)

**Severity**: Low
**Location**: Step 2 constraint types

The plan defines `EdgePolicy = 'equal' | 'broadcastable' | 'reducible'` but `'reducible'` is never used in the algorithm. Either:
- Remove it from the type
- Add algorithm handling for reduce constraints

### Issue 7: Missing Rollback Plan

**Severity**: Medium
**Location**: Plan overall

No guidance on how to revert if the new solver introduces regressions. Recommend:

1. Keep old solver code in a separate branch until new solver is validated
2. Add feature flag to switch between solvers during transition
3. Define specific rollback criteria (e.g., "if >5% of demos fail, revert")

---

## Ambiguities Requiring Clarification

| # | Question | Plan's Assumption | Impact if Wrong |
|---|----------|-------------------|-----------------|
| 1 | Should `InstanceTerm` with var variant exist in `CanonicalType`? | Yes, change canonical type | Violates TYPE-SYSTEM-INVARIANTS rule 4, breaks 14+ call sites |
| 2 | What is the instance variable unification algorithm? | Not specified | Implementation will stall at Step 4 |
| 3 | Is `createBlockInstanceRef` a new function or existing? | Assumes it exists | Step 3 code won't compile |
| 4 | What does `reducible` edge policy do? | Mentioned but unused | Dead code or missing feature |
| 5 | What is the edge propagation order? | Not addressed | Non-deterministic solver violates spec Goal 5 |

---

## Recommendations

### Critical (Must Fix Before Implementation)

1. **Restructure Step 1**: Create `InferenceCardinalityValue` in inference layer only. Do not modify `CardinalityValue`.

2. **Add unification algorithm**: Specify exactly how instance vars are resolved to concrete refs. Include pseudocode for find, unify, and resolve operations.

3. **Create regression tests first**: Before touching solver code, add correctness tests for current behavior. These become the regression baseline.

4. **Enumerate breaking changes**: List every file accessing `CardinalityValue.many.instance.*` and specify how each will be updated (or not, if using inference types).

5. **Define or remove `createBlockInstanceRef`**: Either add the helper function or use inline pattern.

### Important (Should Fix)

6. **Fix typo**: `E_ILLEGAL_ONE_TO_TO_MANY` → `E_ILLEGAL_ONE_TO_MANY`

7. **Remove or implement `reducible`**: Don't leave unused discriminants in types.

8. **Add rollback plan**: Specify how to revert if new solver has regressions.

9. **Specify propagation order**: Define deterministic order for edge propagation to ensure reproducible results.

---

## Revised Step Order

If proceeding after clarifications, recommended order:

| Order | Step | Rationale |
|-------|------|-----------|
| 1 | Create correctness tests | Establish regression baseline |
| 2 | Add `InferenceCardinalityValue` types | Inference-layer only, no breaking changes |
| 3 | Add constraint graph types | New file, no breaking changes |
| 4 | Build constraint graph | Modify `analyze-type-constraints.ts` |
| 5 | Implement new solver with unification | Rewrite `solve-cardinality.ts` |
| 6 | Wire into pipeline | Integration |
| 7 | Add diagnostic codes | Error handling |
| 8 | Run all tests | Validate regression baseline passes |
| 9 | Delete dead code | Cleanup |
| 10 | End-to-end verification | Manual + demos |

---

## Appendix A: Files Requiring Modification

### Step 1 (Revised)

| File | Change |
|------|--------|
| `src/core/ids.ts` | Add `InstanceVarId` |
| `src/compiler/frontend/inference-types.ts` | NEW: Add `InferenceInstanceTerm`, `InferenceCardinalityValue` |

**Note**: `src/core/canonical-types/cardinality.ts` is NOT modified.

### Steps 2-9

| File | Change |
|------|--------|
| `src/compiler/frontend/cardinality-constraints.ts` | NEW: Constraint graph types |
| `src/compiler/frontend/solve-cardinality.ts` | Rewrite solver |
| `src/compiler/frontend/analyze-type-constraints.ts` | Replace `gatherCardinalityConstraints` |
| `src/compiler/types.ts` | Add error codes |
| `src/compiler/frontend/frontendDiagnosticConversion.ts` | Add diagnostic mappings |
| `src/compiler/frontend/__tests__/solve-cardinality-correctness.test.ts` | NEW: Correctness tests |
| `src/compiler/frontend/__tests__/solve-cardinality-trace.test.ts` | Update trace tests |

---

## Appendix B: Call Sites Accessing `CardinalityValue.many.instance`

These sites assume `instance` is `InstanceRef` with direct property access:

```
src/core/canonical-types/equality.ts:30
  a.value.instance.domainTypeId === b.value.instance.domainTypeId

src/core/canonical-types/equality.ts:31
  a.value.instance.instanceId === b.value.instance.instanceId

src/compiler/frontend/solve-cardinality.ts:128
  existing.instance.instanceId

src/compiler/frontend/solve-cardinality.ts:135
  existing.instance

src/compiler/frontend/solve-cardinality.ts:158
  card.value.instance.instanceId

src/ui/reactFlowEditor/typeValidation.ts:185
  card.value.instance.domainTypeId

src/ui/graphEditor/portTooltipFormatters.ts:69
  card.value.instance.instanceId

src/blocks/signal/default-source.ts:241
  cardinality.value.instance

src/blocks/lens/construct.ts:59
  inputCard.value.instance.instanceId

src/blocks/lens/construct.ts:71
  inputCard.value.instance.instanceId

src/blocks/lens/construct.ts:83
  inputCard.value.instance.instanceId
```

If `CardinalityValue.instance` becomes `InstanceTerm`, all of these must add guards:

```typescript
// Every access would need this pattern:
if (card.value.instance.kind === 'inst') {
  card.value.instance.ref.instanceId  // safe
} else {
  // handle var case - but vars shouldn't be here!
}
```

This is why vars must stay in inference layer only.

---

## Appendix C: Relevant Spec References

| Document | Section | Relevance |
|----------|---------|-----------|
| `design-docs/cardinality-solver.md` | §3.2 | Constraint types |
| `design-docs/cardinality-solver.md` | §4 | Solver algorithm phases |
| `.claude/rules/TYPE-SYSTEM-INVARIANTS.md` | Rule 4 | Vars are inference-only |
| `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` | Goal 5 | Deterministic compilation |

---

## Verdict

**PAUSE** - The plan requires clarification on 3 blocking questions before implementation can proceed efficiently.

| Question | Owner | Priority |
|----------|-------|----------|
| Should `InstanceTerm` exist in canonical types? | Architect | P0 |
| What is the instance unification algorithm? | Architect | P0 |
| Helper function or inline pattern? | Implementer | P1 |

Once answered, the plan can be revised and implementation can proceed with confidence.
