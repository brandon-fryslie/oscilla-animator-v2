# Sprint: Payload Stride Object - Make ConcretePayloadType Carry Stride

**Generated:** 2026-01-26
**Confidence:** HIGH: 3, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Change `ConcretePayloadType` from a string union to a discriminated union with stride as an intrinsic property. Stride becomes immediately available wherever payload type is known, eliminating lookup tables and preventing heuristic-based bugs.

## Scope

**Deliverables:**
1. Change `ConcretePayloadType` to discriminated union with stride
2. Update `strideOf()` to return `type.stride` directly (preserve function for compatibility)
3. Fix `ContinuityApply.ts` to use proper stride from `StepContinuityApply`
4. Update all type comparisons from `payload === 'float'` to `payload.kind === 'float'`

## Work Items

### P0: Change ConcretePayloadType Definition
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] `ConcretePayloadType` is a discriminated union with `kind` and `stride` fields
- [ ] Each variant has literal stride type (e.g., `stride: 2` not `stride: number`)
- [ ] Factory functions exist: `payloadFloat()`, `payloadVec2()`, etc.
- [ ] `PAYLOAD_STRIDE` lookup table removed or deprecated
- [ ] `strideOf()` updated to return `type.stride` (function preserved for compatibility)
- [ ] TypeScript compiles with no errors

**Technical Notes:**
```typescript
export type ConcretePayloadType =
  | { readonly kind: 'float'; readonly stride: 1 }
  | { readonly kind: 'int'; readonly stride: 1 }
  | { readonly kind: 'bool'; readonly stride: 1 }
  | { readonly kind: 'vec2'; readonly stride: 2 }
  | { readonly kind: 'vec3'; readonly stride: 3 }
  | { readonly kind: 'color'; readonly stride: 4 }
  | { readonly kind: 'shape'; readonly stride: 8 }
  | { readonly kind: 'cameraProjection'; readonly stride: 1 };

// Factory functions
export const FLOAT: ConcretePayloadType = { kind: 'float', stride: 1 };
export const VEC2: ConcretePayloadType = { kind: 'vec2', stride: 2 };
// etc.

// strideOf() preserved for compatibility
export function strideOf(type: ConcretePayloadType): number {
  return type.stride;
}
```

**File:** `src/core/canonical-types.ts`

---

### P1: Update Type Comparisons Across Codebase
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] All `payload === 'float'` comparisons changed to `payload.kind === 'float'`
- [ ] All `payload === 'vec2'` comparisons changed to `payload.kind === 'vec2'`
- [ ] All switch statements on payload updated to switch on `payload.kind`
- [ ] `isConcretePayload()` updated for new structure
- [ ] `payloadsEqual()` updated for new structure
- [ ] TypeScript compiles with no errors
- [ ] All tests pass

**Technical Notes:**
Files identified that need comparison updates:
- `src/core/canonical-types.ts` - `ALLOWED_UNITS`, `isConcretePayload()`, `payloadsEqual()`, `defaultUnitForPayload()`
- `src/compiler/ir/bridges.ts` - payload switches
- `src/compiler/ir/signalExpr.ts` - payload switches
- `src/compiler/passes-v2/pass1-type-constraints.ts` - payload comparisons
- `src/ui/reactFlowEditor/typeValidation.ts` - payload comparisons
- `src/ui/debug-viz/types.ts` - payload usage

**Files:** Multiple (see Technical Notes)

---

### P2: Fix ContinuityApply.ts Stride Bug
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] `StepContinuityApply` interface has `stride: number` field
- [ ] Pass7 (schedule generation) populates stride from resolved payload type
- [ ] `ContinuityApply.ts:321` uses `step.stride` instead of `semantic === 'position' ? 2 : 1`
- [ ] Test `level9-continuity-decoupling.test.ts` updated to verify correct behavior
- [ ] All tests pass

**Technical Notes:**
This is the critical bug fix. The compiler knows the payload type when creating `StepContinuityApply` - it must pass stride through.

**Files:**
- `src/compiler/ir/types.ts` - Add stride to StepContinuityApply
- `src/compiler/passes-v2/pass7-schedule.ts` - Populate stride field
- `src/runtime/ContinuityApply.ts` - Use step.stride
- `src/projection/__tests__/level9-continuity-decoupling.test.ts` - Update test assertions

---

## Dependencies
- P0 must complete before P1 (type definition needed for comparisons)
- P0 and P1 should complete before P2 (though P2 could be done in parallel if stride is added to IR first)

## Risks
1. **Breaking changes to PayloadType union** - `PayloadType` includes both `ConcretePayloadType` and `PayloadVar`. The `PayloadVar` structure (`{ kind: 'var', id: string }`) already uses `kind`, so this is consistent.
2. **Record type keys** - `ALLOWED_UNITS` and similar `Record<ConcretePayloadType, ...>` need to change to use `kind` values as keys or restructure.

## Implementation Order

1. Start with P0 - define new type structure and factories
2. Run typecheck to find all broken comparisons
3. Fix comparisons (P1) file by file
4. Add stride to StepContinuityApply and fix ContinuityApply.ts (P2)
5. Run full test suite

## Out of Scope
- Eliminating `strideOf()` entirely (tracked in bead `oscilla-animator-v2-24k`)
- Changing existing `strideOf()` call sites to use `.stride` directly
