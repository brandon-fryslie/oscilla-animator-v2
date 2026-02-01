# IR Expression System - To Review

## Overview
The IR expression system has been successfully migrated to the unified ValueExpr model. This analysis identifies minor inconsistencies that should be reviewed but are not blocking.

---

## R1: Sub-variant discriminants use mixed patterns (kernelKind vs op)

**Spec Requirement:**
- Spec §1 states: "Each variant has `op` discriminant (not `kind`)"
- Spec §11 states: "Naming & Discriminants Are Consistent"

**Current State:**
- **File:** `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/value-expr.ts`
- Top-level uses `kind` (correct for unified table)
- `ValueExprKernel` sub-variants use `kernelKind` discriminant (lines 154, 161, 168, 175, 182, 189)
- `ValueExprIntrinsic` sub-variants use `intrinsicKind` discriminant (lines 127, 134)
- `ValueExprEvent` sub-variants use `eventKind` discriminant (lines 259, 265, 271, 278, 283)
- But `ValueExprKernel` reduce/pathDerivative variants also have an `op` field for the operation type:
  - Line 184: `readonly op: 'min' | 'max' | 'sum' | 'avg'`
  - Line 191: `readonly op: 'tangent' | 'arcLength'`

**Classification Rationale:**
This is a "to-review" item because:
1. The spec is ambiguous - it says "op discriminant" but doesn't specify which level
2. Current implementation has a two-level discriminant system: `kind` at top level, then `kernelKind`/`intrinsicKind`/`eventKind` for sub-variants
3. The `op` field in reduce/pathDerivative is a *parameter*, not a discriminant
4. All IR tests pass (no-legacy-types.test.ts, value-expr-invariants.test.ts)
5. The pattern is internally consistent and type-safe

**Recommendation:**
Review with spec author to clarify:
- Is the two-level discriminant system (`kind` → `kernelKind`) acceptable?
- Should sub-variants use `op` instead of `kernelKind`/`eventKind`/`intrinsicKind`?
- Or should spec be updated to match the implemented pattern?

**Evidence:**
```typescript
// Current implementation (value-expr.ts:150-192)
export type ValueExprKernel =
  | {
      readonly kind: 'kernel';        // Top-level discriminant
      readonly type: CanonicalType;
      readonly kernelKind: 'map';     // Sub-variant discriminant
      readonly input: ValueExprId;
      readonly fn: PureFn;
    }
  | {
      readonly kind: 'kernel';
      readonly type: CanonicalType;
      readonly kernelKind: 'reduce';  // Sub-variant discriminant
      readonly field: ValueExprId;
      readonly op: 'min' | 'max' | 'sum' | 'avg';  // Operation parameter (not discriminant)
    }
  // ... etc
```

---

## R2: StepRender uses 'k' discriminant instead of 'kind'

**Spec Requirement:**
- Spec §9 states: "StepRender should use typed attribute schema, not ad-hoc optional channels"
- Spec §11 states: "choose one discriminant name per union style and stick to it everywhere"

**Current State:**
- **File:** `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts:286-305`
- `StepRender.scale` uses `{ k: 'sig'; id: ValueExprId }` (line 294)
- `StepRender.shape` uses `{ k: 'sig'; ... } | { k: 'slot'; ... }` (lines 296-298)
- `StepRender.controlPoints` uses `{ k: 'slot'; ... }` (line 300)
- All other Step types use `kind` as their discriminant

**Classification Rationale:**
This is "to-review" because:
1. The inconsistency is intentional (short `k` for inline discriminated unions vs `kind` for main step types)
2. It doesn't violate type safety
3. The pattern is used consistently within StepRender
4. However, it creates a naming inconsistency across the IR

**Recommendation:**
Consider standardizing to `kind` everywhere for consistency, or document the convention:
- Main union types (Step, ValueExpr) use `kind`
- Inline helper unions use `k` for brevity

**Evidence:**
```typescript
// StepRender (types.ts:286-305)
export interface StepRender {
  readonly kind: 'render';  // Main discriminant uses 'kind'
  readonly instanceId: InstanceId;
  readonly positionSlot: ValueSlot;
  readonly colorSlot: ValueSlot;
  readonly scale?: { readonly k: 'sig'; readonly id: ValueExprId };  // Inline uses 'k'
  readonly shape:
    | { readonly k: 'sig'; readonly topologyId: TopologyId; readonly paramSignals: readonly ValueExprId[] }
    | { readonly k: 'slot'; readonly slot: ValueSlot };
  // ...
}
```

---

## R3: Hard-coded step kinds in schedule generation

**Spec Requirement:**
- Spec §4 states: "Schedule steps should not have hard-coded 'evalSig', 'evalField', 'evalEvent' - should be derived"

**Current State:**
- **File:** `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts:251-256, 352-357`
- `StepEvalSig` exists with `kind: 'evalSig'` (lines 251-255)
- `StepEvalEvent` exists with `kind: 'evalEvent'` (lines 352-356)
- No `StepEvalField` exists (materialization uses `StepMaterialize` instead)
- **File:** `/Users/bmf/code/oscilla-animator-v2/src/compiler/backend/schedule-program.ts:641, 658`
- Schedule builder creates these steps with hard-coded kind values

**Classification Rationale:**
This is "to-review" because:
1. The spec says these "should" be derived, not "must" be derived
2. The current implementation is explicit and type-safe
3. Having separate step types (`StepEvalSig`, `StepEvalEvent`) provides type safety
4. There's no `StepEvalField` - fields use `StepMaterialize` which is a different semantic
5. The trade-off is explicitness vs. derivation

**Recommendation:**
Clarify with spec author:
- Should step kinds be derived from `ValueExpr.type.extent` at runtime?
- Or is explicit typing acceptable for the schedule IR?
- Consider: If we derive step kinds, we lose compile-time guarantees about schedule structure

**Evidence:**
```typescript
// Current implementation (types.ts:251-256)
export interface StepEvalSig {
  readonly kind: 'evalSig';
  readonly expr: ValueExprId;
  readonly target: ValueSlot;
}

// Schedule generation (schedule-program.ts:641)
const step: Step = {
  kind: 'evalSig',  // Hard-coded
  expr: sigId as ValueExprId,
  target: slot,
};
```

---

## Summary

All three items are design consistency questions rather than bugs:
1. **R1:** Mixed discriminant naming (`kind` vs `kernelKind` vs `op`) - internally consistent but may not match spec intent
2. **R2:** Inline union discriminants use `k` instead of `kind` - minor naming inconsistency
3. **R3:** Hard-coded step kinds instead of derived - explicit vs derived trade-off

**Next Steps:**
- Review with spec author to determine if these patterns are acceptable
- Update spec to document accepted patterns, OR
- Refactor code to match spec intent if clarified

**Test Coverage:**
- ✅ All IR tests passing (no-legacy-types.test.ts, value-expr-invariants.test.ts, no-legacy-kind-dispatch.test.ts)
- ✅ No legacy type references found
- ✅ Type system enforces all invariants at compile time
