# Runtime & Enforcement Audit Summary
**Date**: 2026-02-01
**Auditor**: Claude (Sonnet 4.5)
**Scope**: Runtime layer and enforcement mechanisms vs canonical types spec

## Executive Summary

The runtime layer shows **strong adherence** to enforcement principles with a **well-implemented validation gate**, but has **architectural gaps** in storage keying and schedule step dispatch that create technical debt and limit future capabilities.

### Strengths ✅
1. **Single axis-validation gate** - No scattered checks, proper var escape prevention
2. **No deriveKind usage** - Production code dispatches on extent axes directly
3. **Type-driven stride** - payloadStride() is single authority
4. **Two-phase execution** - Proper state isolation, prevents causality violations

### Critical Gaps ❌
1. **Hard-coded step discriminants** - evalSig/evalEvent bypass type system
2. **No branch-scoped state** - Can't support parallel timelines
3. **No stamp buffers** - Missing discrete temporality metadata
4. **Implicit lane tracking** - Fragile during hot-swap

### Items Needing Review ⚠️
1. Is ValueSlot abstraction sufficient for "keyed by (ValueExprId, lane)"?
2. Is defaultUnitForPayload usage for ergonomics acceptable?
3. Are event stamps required or optional?
4. Must state scoping be explicit or is implicit sufficient?

## Files Created

### Critical Issues
- `/Users/bmf/code/oscilla-animator-v2/.agent_planning/gap-analysis/critical/topic-runtime-enforcement.md`
  - 4 critical gaps identified
  - Focus: Schedule step dispatch, branch scoping, lane tracking, stamps

- `/Users/bmf/code/oscilla-animator-v2/.agent_planning/gap-analysis/critical/context-runtime-enforcement.md`
  - Implementation context
  - Spec vs reality comparison

### Unimplemented Features
- `/Users/bmf/code/oscilla-animator-v2/.agent_planning/gap-analysis/unimplemented/topic-runtime-enforcement.md`
  - 5 unimplemented features
  - Focus: Storage keying, branch scoping, stamps, unified dispatch, lane metadata

- `/Users/bmf/code/oscilla-animator-v2/.agent_planning/gap-analysis/unimplemented/context-runtime-enforcement.md`
  - Spec references
  - Implementation dependencies
  - Next steps priority

### Items to Review
- `/Users/bmf/code/oscilla-animator-v2/.agent_planning/gap-analysis/to-review/topic-runtime-enforcement.md`
  - 5 items needing clarification
  - Focus: Design intent vs implementation tradeoffs

- `/Users/bmf/code/oscilla-animator-v2/.agent_planning/gap-analysis/to-review/context-runtime-enforcement.md`
  - Arguments for/against each interpretation
  - Resolution paths

## Key Findings Detail

### ✅ What's Working Well

#### Enforcement Gate (axis-validate.ts)
- Single validation point for all types
- Hard invariants enforced: event=discrete+bool+none, field=many+continuous, signal=one+continuous
- Var escape prevention: validateNoVarAxes() blocks vars in backend
- No bypass paths found in debug/preview modes

**Evidence**:
```typescript
// axis-validate.ts:105-117
export function validateType(t: CanonicalType): void {
  const card = requireInst(t.extent.cardinality, 'cardinality');
  const tempo = requireInst(t.extent.temporality, 'temporality');
  if (tempo.kind === 'discrete') {
    assertEventInvariants(t);
  } else if (card.kind === 'many') {
    assertFieldInvariants(t);
  } else {
    assertSignalInvariants(t);
  }
}
```

#### Type-Driven Dispatch (No deriveKind)
- Grep search: deriveKind only in tests and comments
- Backend code uses `requireInst(type.extent.cardinality)` pattern
- Stride derived from payload only: `payloadStride(type.payload)`

**Evidence**:
```bash
$ grep -r "deriveKind(" src/ --include="*.ts" --exclude="*test.ts"
# Only hits:
# - src/compiler/backend/lower-blocks.ts:480: // Check extent directly instead of using deriveKind
# - src/compiler/frontend/axis-validate.ts:103: // Dispatches on extent axes directly (no deriveKind dependency)
```

### ❌ Critical Gaps

#### C1: Schedule Step Discriminants Bypass Type System
**Violation**: Guardrail #2 "Derived Kind Must Be Total and Deterministic"

Current schedule has hard-coded evalSig/evalEvent kinds:
```typescript
// ir/types.ts - Step union
type Step =
  | { kind: 'evalSig'; ... }
  | { kind: 'evalEvent'; ... }
  | ...

// ScheduleExecutor.ts:213-256
switch (step.kind) {
  case 'evalSig': { /* ... */ }
  case 'evalEvent': { /* ... */ }
}
```

**Should be**:
```typescript
type Step = { kind: 'eval'; expr: ValueExprId; type: CanonicalType; ... }

// Dispatch on type
const tempo = requireInst(step.type.extent.temporality, 'temporality');
if (tempo.kind === 'discrete') {
  evaluateEvent(step.expr, state);
} else {
  evaluateValue(step.expr, state);
}
```

#### C2: No Branch-Scoped State
**Violation**: Spec requirement "State storage must be branch-scoped"

Current state is flat:
```typescript
// RuntimeState.ts:498
state: Float64Array
```

**Should be**:
```typescript
state: Map<BranchId, Float64Array>
```

**Impact**: Cannot support parallel timelines (e.g., multi-variant animations with independent state).

#### C3: No Lane Identity for Field State
**Issue**: Field state writes assume contiguous layout but don't enforce/track lane mapping.

```typescript
// ScheduleExecutor.ts:559-562
const baseSlot = step.stateSlot as number;
for (let i = 0; i < count && i < src.length; i++) {
  state.state[baseSlot + i] = src[i];  // ← Implicit lane = i
}
```

**Risk**: Hot-swap with changing instance counts may corrupt state.

**Should have**: Explicit metadata tracking (ValueExprId, instanceId, laneIndex) → stateSlot.

#### C4: No Stamp Buffers
**Missing**: Spec requires `valueStamp[ValueExprId, lane] = lastTickOrFrameWritten` for discrete temporality.

Current event clearing is time-based, not stamp-based:
```typescript
// ScheduleExecutor.ts:166-172
state.eventScalars.fill(0);  // ← Clears all, no stamps
```

**Spec requires**: Stamp tracking so consumers can detect "fresh" vs "stale" events.

### ⚠️ Items Needing Review

#### R1: ValueSlot vs (ValueExprId, lane) Keying
**Question**: Is opaque ValueSlot sufficient?

Current approach:
- Compiler allocates slots deterministically
- Slot metadata maps slot → (storage, offset, stride)
- Runtime uses slots, not ValueExprIds

**Spec says**: "Storage keyed by (ValueExprId, lane)"

**Interpretation needed**: Does this mean:
1. **Literal**: Runtime MUST use ValueExprId as key (major refactor)
2. **Functional**: Indirection via slots OK if allocation is deterministic (documentation fix)

#### R2: defaultUnitForPayload for Ergonomics
**Question**: Is explicit use in construction helpers acceptable?

```typescript
// canonical-types.ts:703-719
export function canonicalType(
  payload: PayloadType,
  unit?: UnitType,  // ← Optional
  extentOverrides?: Partial<Extent>
): CanonicalType {
  return {
    payload,
    unit: unit ?? defaultUnitForPayload(payload),  // ← Explicit default
    extent: { /* ... */ },
  };
}
```

**Guardrail #6 says**: "defaultUnitForPayload never used as silent fallback"

**Interpretation needed**: Does "silent fallback" include:
1. **Yes**: ANY use of defaultUnitForPayload (remove it)
2. **No**: Only silent error recovery (current ergonomic use is OK)

#### R3: Event Stamps - Required or Optional?
**Question**: Must we implement stamps or is frame-based clearing sufficient?

Current model works for:
- ✅ One-frame event lifetime
- ✅ Monotone OR semantics
- ✅ Frame-level consistency

Stamps enable:
- Debugging (when last fired)
- Multi-consumer tracking
- Event history/replay

**Spec says**: "For discrete temporality: stamp buffer"

**Interpretation needed**: Is this:
1. **Mandatory**: Must implement now
2. **Optional**: Nice-to-have for debugging
3. **Future**: Defer until needed

## Recommendations

### Immediate Actions
1. **Unify schedule step dispatch** (C1)
   - Replace evalSig/evalEvent with single eval + type
   - Dispatch on extent axes
   - Remove parallel classification

2. **Document slot allocation contract** (R1)
   - Clarify how slots map to (ValueExprId, lane)
   - Formalize slot allocation algorithm
   - Add validation tests

### Medium-Term
3. **Add branch-scoped state** (C2)
   - Restructure state storage for branch map
   - Update stateWrite steps
   - Implement state migration

4. **Explicit lane metadata** (C3)
   - Track (ValueExprId, instanceId, lane) → slot
   - Validate during hot-swap
   - Document lane preservation guarantees

### Clarifications Needed
5. **Resolve R1-R5 questions**
   - ValueSlot sufficiency
   - defaultUnitForPayload intent
   - Event stamp requirements
   - State scoping explicitness
   - Step kind unification timeline

## Test Coverage Recommendations

### Add Tests For
1. **Slot allocation determinism**
   - Same graph → same slots across compiles
   - Field lanes contiguous
   - State slot preservation during hot-swap

2. **Type-driven dispatch**
   - All extent axis combinations covered
   - No step.kind bypass paths
   - Stride from payload only

3. **Branch/lane isolation**
   - State writes don't leak across branches
   - Field state preserves lane identity
   - Hot-swap with instance count changes

4. **Enforcement gate coverage**
   - All invalid type combinations rejected
   - Var escape detected
   - No bypass in any code path

## Related Work

### Completed
- Axis validation gate (SPRINT-20260129-200000-validation-gate)
- deriveKind deletion
- No var escape enforcement

### In Progress
- ValueExpr unification (would help eliminate step kind dispatch)

### Deferred/Unimplemented
- Branch-scoped state
- Stamp buffers
- Lane metadata tracking
- Unified schedule dispatch

## Conclusion

The runtime enforcement layer has a **solid foundation** with proper axis validation and type-driven patterns, but suffers from **architectural debt** in schedule step dispatch and storage keying. The biggest risks are:

1. **Schedule step kinds** creating a parallel type system
2. **Branch/lane scoping** blocking advanced features
3. **Implicit contracts** making hot-swap fragile

The **to-review items** are critical to resolve before major refactoring, as they determine whether current patterns need fixing or just documentation.

**Priority order**:
1. Resolve R1-R5 (clarify intent)
2. Fix C1 (unified dispatch)
3. Implement C2 (branch scoping)
4. Address C3-C4 based on review outcomes
