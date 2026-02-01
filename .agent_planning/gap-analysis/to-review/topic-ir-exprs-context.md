# IR Expression System Audit - Context

## Audit Date
2026-02-01

## Scope
Complete audit of IR expression system against TYPE-SYSTEM-INVARIANTS.md spec.

## Files Examined

### Core IR Files
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts` (14,272 bytes)
  - Step type definitions (StepEvalSig, StepEvalEvent, StepRender, etc.)
  - InstanceDecl, ContinuityPolicy, StateMapping types

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/value-expr.ts` (8,789 bytes)
  - Canonical ValueExpr union (10 kinds)
  - All expression variant definitions

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/IRBuilder.ts` (7,823 bytes)
  - IRBuilder interface definition

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/IRBuilderImpl.ts` (16,472 bytes)
  - IRBuilder implementation
  - Expression construction and hash-consing

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/lowerTypes.ts` (4,907 bytes)
  - ValueRefPacked (unified around ValueExprId, no k:'sig'|'field'|'event')
  - LoweredOutput types

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/Indices.ts` (4,082 bytes)
  - Branded ID types (ValueExprId, StateSlotId, etc.)

- `/Users/bmf/code/oscilla-animator-v2/src/core/canonical-types.ts` (partial read, lines 1-150)
  - CanonicalType definition
  - ConstValue discriminated union
  - Unit system

### Backend/Schedule Files
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/backend/schedule-program.ts` (partial reads)
  - Schedule IR generation
  - Step construction with hard-coded kinds

### Test Files
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/no-legacy-types.test.ts`
  - Enforces no SigExpr/FieldExpr/EventExpr references in production code
  - Enforces no deriveKind() calls
  - ✅ PASSING

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/__tests__/value-expr-invariants.test.ts`
  - Enforces exactly 10 ValueExpr kinds
  - Enforces every variant has type: CanonicalType
  - Compile-time exhaustiveness checks
  - ✅ PASSING

- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/__tests__/no-legacy-kind-dispatch.test.ts`
  - Prevents dispatch on legacy expression kinds
  - ✅ PASSING

## Test Results
```
npm run test -- --run src/compiler/ir/__tests__/
✓ value-expr-invariants.test.ts (17 tests) 4ms
✓ no-embedded-valueexpr.test.ts (4 tests) 33ms
✓ bridges.test.ts (17 tests | 2 skipped) 3ms
✓ hash-consing.test.ts (32 tests) 5ms
✓ no-legacy-kind-dispatch.test.ts (1 test) 117ms

Test Files  5 passed (5)
Tests  69 passed | 2 todo (71)
```

## Spec Requirements Checked

### ✅ COMPLIANT Requirements

1. **Unified ValueExpr IR** (Spec §1)
   - ✅ ValueExpr is the single expression type
   - ✅ All variants carry `type: CanonicalType`
   - ✅ Uses `kind` discriminant at top level
   - ✅ 10 kinds: const, external, intrinsic, kernel, state, time, shapeRef, eventRead, event, slotRead

2. **No stored kind on expressions** (Spec §3)
   - ✅ No `kind: 'sig'|'field'|'event'` stored on expressions
   - ✅ Signal/field/event semantics derived from `type.extent`
   - ✅ ValueRefPacked no longer has `k` discriminant (lowerTypes.ts:41-69)

3. **EventExpr has type field** (Spec §2)
   - ✅ All ValueExprEvent variants have `type: CanonicalType` (value-expr.ts:255-285)

4. **No instanceId on field expressions** (Spec §2)
   - ✅ No `instanceId?` optional fields on ValueExpr variants
   - ✅ Instance identity derived from `requireManyInstance(type.extent.cardinality)`
   - ⚠️ `IRBuilder.allocStateSlot` has optional `instanceId` param (IRBuilder.ts:163) - but this is for STATE allocation, not field expressions

5. **ConstValue is discriminated union** (Spec §5)
   - ✅ ConstValue uses discriminated union (canonical-types.ts:323-330)
   - ✅ NOT number|string|boolean
   - ✅ Kinds: float, int, bool, vec2, vec3, color, cameraProjection

6. **No snake_case discriminants** (Spec §6)
   - ✅ No `reduce_field` found (searched entire codebase)
   - ✅ All discriminants use camelCase

7. **IRBuilder enforces type constraints** (Spec §7)
   - ✅ All builder methods require `type: CanonicalType` parameter
   - ✅ Hash-consing prevents duplicate expressions

8. **No FieldExprArray** (Spec §8)
   - ✅ No references to FieldExprArray found

9. **No legacy types** (Spec §2)
   - ✅ SigExpr, FieldExpr, EventExpr deleted
   - ✅ SigExprId, FieldExprId, EventExprId deleted
   - ✅ deriveKind() function deleted
   - ✅ Enforcement tests passing

### ⚠️ TO REVIEW Requirements

1. **op vs kind discriminant** (Spec §1, §11)
   - Current: Uses `kind` at top level, `kernelKind`/`eventKind`/`intrinsicKind` for sub-variants
   - Spec unclear: Says "Each variant has op discriminant (not kind)" but may refer to sub-variants
   - See R1 in main analysis

2. **StepRender attribute schema** (Spec §9)
   - Current: Uses inline `{ k: 'sig'|'slot' }` discriminants
   - Main types use `kind`, inline helpers use `k`
   - See R2 in main analysis

3. **Derived step kinds** (Spec §4)
   - Current: `StepEvalSig`, `StepEvalEvent` have hard-coded kinds
   - Spec suggests deriving from extent at runtime
   - Trade-off: Explicit typing vs derivation
   - See R3 in main analysis

## Key Design Decisions Found

1. **Two-level discriminant system**
   - Top level: `kind` (10 values)
   - Sub-variants: `kernelKind`, `eventKind`, `intrinsicKind`
   - Provides fine-grained dispatch while maintaining unified table

2. **No StepEvalField**
   - Fields use `StepMaterialize` instead
   - Different semantic: field materialization vs signal evaluation
   - Prevents confusion between evaluation models

3. **instanceId only on state allocation**
   - `IRBuilder.allocStateSlot` has optional `instanceId` for field state
   - NOT on expression types themselves
   - Correctly separates state slot allocation from expression representation

4. **Hash-consing for expression deduplication**
   - IRBuilderImpl maintains exprCache (IRBuilderImpl.ts:58)
   - Prevents duplicate expressions in IR
   - Implements Invariant I13

## Migration Status

### ✅ Complete
- Legacy SigExpr/FieldExpr/EventExpr deleted
- All expressions use unified ValueExpr
- All tests enforce new structure
- No legacy type references in production code

### ⚠️ Pending Spec Clarification
- Discriminant naming convention (kind vs op)
- Inline union discriminants (k vs kind)
- Derived vs explicit step kinds

## Recommendations

1. **Clarify spec intent** for discriminant naming
   - Document two-level pattern if acceptable
   - OR refactor to match spec if single-level required

2. **Document inline discriminant convention**
   - If `k` for inline unions is acceptable, document the pattern
   - If not, refactor StepRender to use `kind`

3. **Decide on step kind derivation**
   - If derivation is required, implement runtime dispatch
   - If explicit is acceptable, update spec to match

4. **No code changes needed** unless spec clarification requires them
   - Current implementation is type-safe and tested
   - All invariant enforcement tests passing
   - Migration from legacy types is complete
