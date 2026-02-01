# Implementation Context: Step Format Unification

Generated: 2026-02-01T14:00:00Z
Updated: 2026-02-01T15:00:00Z

## 1. Current Step System (verified 2026-02-01)

### Step union (src/compiler/ir/types.ts:240-249)
```typescript
export type Step =
  | StepEvalSig           // kind: 'evalSig'    — lines 251-255
  | StepSlotWriteStrided  // kind: 'slotWriteStrided' — lines 273-277
  | StepMaterialize       // kind: 'materialize' — lines 279-284
  | StepRender            // kind: 'render'      — lines 286-305
  | StepStateWrite        // kind: 'stateWrite'  — lines 307-311
  | StepFieldStateWrite   // kind: 'fieldStateWrite' — lines 317-321
  | StepContinuityMapBuild // kind: 'continuityMapBuild' — lines 327-331
  | StepContinuityApply   // kind: 'continuityApply' — lines 337-346
  | StepEvalEvent;        // kind: 'evalEvent'   — lines 352-356
```

### StepEvalSig (lines 251-255)
```typescript
interface StepEvalSig {
  readonly kind: 'evalSig';
  readonly expr: ValueExprId;
  readonly target: ValueSlot;
}
```

### StepEvalEvent (lines 352-356)
```typescript
interface StepEvalEvent {
  readonly kind: 'evalEvent';
  readonly expr: ValueExprId;
  readonly target: EventSlotId;
}
```

### Storage types (src/compiler/ir/Indices.ts)
```typescript
// Line 26-27: Float64Array-backed value storage
export type ValueSlot = number & { readonly __brand: 'ValueSlot' };

// Line 39-40: Boolean event storage (distinct backend)
export type EventSlotId = number & { readonly __brand: 'EventSlotId' };
```

### Executor switch (ScheduleExecutor.ts:213-452)
9 cases:
- `case 'evalSig':` (lines 214-257) — signal evaluation, writes to `ValueSlot`
- `case 'evalEvent':` (lines 432-441) — event evaluation, writes to `EventSlotId`
- 7 other cases (slotWriteStrided, materialize, render, stateWrite, fieldStateWrite, continuityMapBuild, continuityApply)

### Step creation sites
- `IRBuilderImpl.ts` (lines 333-368): `stepEvalSig()`, `stepEvalEvent()`, etc.
- `schedule-program.ts` (lines 640-660): direct object literals for evalSig/evalEvent
- `schedule-program.ts` (lines 678-697): execution order assembly

### Execution phase ordering (schedule-program.ts:678-697)
```
Phase 1: evalSigStepsPre       (signals NOT dependent on events)
Phase 2: slotWriteStridedSteps  (multi-component signals)
Phase 3: mapBuildSteps          (domain change detection)
Phase 4: materializeSteps       (field evaluation)
Phase 5: continuityApplySteps   (gauge/slew/crossfade)
Phase 6: evalEventSteps         (discrete events)
Phase 7: evalSigStepsPost       (signals dependent on eventRead)
Phase 8: renderSteps            (render operations)
Phase 9: stateWriteSteps        (Phase 2 state persistence)
```

## 2. Design Decisions (resolved)

### Decision 1: Keep ValueSlot and EventSlotId separate

**Rationale:** They index into fundamentally different storage backends:
- `ValueSlot` → `Float64Array` (signal/field values)
- `EventSlotId` → separate boolean arrays (`eventScalars`, `eventPrevPredicate`)

Unifying would lose type safety at the branded-type level and require runtime storage dispatch.

**Implementation:** Use a discriminated union target:
```typescript
type EvalTarget =
  | { readonly storage: 'value'; readonly slot: ValueSlot }
  | { readonly storage: 'event'; readonly slot: EventSlotId }
```

### Decision 2: StepMaterialize remains separate

**Rationale:** `StepMaterialize` has fundamentally different fields:
- `instanceId: InstanceId` (field evaluation is instance-bound)
- `field: ValueExprId` (not `expr`)
- `target: ValueSlot`
- It represents field materialization (computing instance arrays), not expression evaluation

Merging it into `StepEvalValue` would require optional `instanceId` fields, violating "make it impossible" — a step without instanceId could accidentally use the field path.

### Decision 3: Use const enum for EvalStrategy

**Rationale:** `const enum` inlines to integer constants at compile time, giving identical performance to current string switch without runtime string comparison. V8 optimizes both patterns well, but integers are strictly not-worse.

```typescript
const enum EvalStrategy {
  ContinuousScalar = 0,   // was 'evalSig' path, cardinality one
  ContinuousField  = 1,   // was 'evalSig' path, cardinality many (field-producing signal)
  DiscreteScalar   = 2,   // was 'evalEvent' path, cardinality one
  DiscreteField    = 3,   // future: field events (not currently produced)
}
```

## 3. Target Step Model

### New StepEvalValue
```typescript
interface StepEvalValue {
  readonly kind: 'evalValue';
  readonly expr: ValueExprId;
  readonly target: EvalTarget;
  readonly strategy: EvalStrategy;
}
```

### Updated Step union (8 variants, was 9)
```typescript
type Step =
  | StepEvalValue          // NEW: replaces StepEvalSig + StepEvalEvent
  | StepSlotWriteStrided
  | StepMaterialize        // KEPT SEPARATE (instanceId, different semantics)
  | StepRender
  | StepStateWrite
  | StepFieldStateWrite
  | StepContinuityMapBuild
  | StepContinuityApply;
```

### Strategy derivation (compile-time, in schedule-program.ts)
```typescript
function deriveStrategy(type: CanonicalType): EvalStrategy {
  const temp = requireInst(type.extent.temporality, 'temporality');
  const card = requireInst(type.extent.cardinality, 'cardinality');
  const isDiscrete = temp.kind === 'discrete';
  const isMany = card.kind === 'many';
  if (isDiscrete) {
    return isMany ? EvalStrategy.DiscreteField : EvalStrategy.DiscreteScalar;
  }
  return isMany ? EvalStrategy.ContinuousField : EvalStrategy.ContinuousScalar;
}
```

### Executor dispatch (replaces two separate cases)
```typescript
case 'evalValue': {
  switch (step.strategy) {
    case EvalStrategy.ContinuousScalar: {
      // Same as current 'evalSig' scalar path
      const value = evaluateSignal(step.expr, ...);
      state.writeValue((step.target as { slot: ValueSlot }).slot, value);
      break;
    }
    case EvalStrategy.ContinuousField: {
      // Same as current field evaluation through evalSig
      // (fields that produce per-instance arrays)
      break;
    }
    case EvalStrategy.DiscreteScalar: {
      // Same as current 'evalEvent' path
      const fired = evaluateEvent(step.expr, ...);
      state.writeEvent((step.target as { slot: EventSlotId }).slot, fired);
      break;
    }
    case EvalStrategy.DiscreteField: {
      // Future: field events
      throw new Error('DiscreteField not yet implemented');
    }
  }
  break;
}
```

## 4. Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `src/compiler/ir/types.ts` | Delete StepEvalSig + StepEvalEvent, add StepEvalValue + EvalTarget + EvalStrategy | ~251-260, ~352-356 |
| `src/compiler/ir/IRBuilderImpl.ts` | Replace `stepEvalSig()` + `stepEvalEvent()` with `stepEvalValue()` | ~333-345 |
| `src/compiler/backend/schedule-program.ts` | Emit StepEvalValue with `deriveStrategy()`, update phase assembly | ~640-697 |
| `src/runtime/ScheduleExecutor.ts` | Replace `case 'evalSig'` + `case 'evalEvent'` with `case 'evalValue'` + strategy switch | ~214-257, ~432-441 |
| `src/__tests__/forbidden-patterns.test.ts` | Un-skip enforcement test 4 (evalSig/evalEvent eliminated) | TBD |
| Test files referencing evalSig/evalEvent | Update step kind references | grep for `evalSig\|evalEvent` in test files |

## 5. What NOT to Change (Deferred to Sprint 4)

- `RuntimeState.state: Float64Array` layout — keep flat, no branch scoping
- Event storage model — keep `eventScalars`, `eventPrevPredicate`, `events` separate
- Lane identity tracking — keep implicit offset math
- Stamp buffers — not implemented, not needed yet
- `StepMaterialize`, `StepRender`, etc. — remain as-is (separate concerns)

## 6. Performance Notes

- `const enum` inlines to integer constants → zero string comparison overhead
- Pre-resolved `strategy` means zero per-step type inspection in hot loop
- Phase ordering unchanged — `evalSigStepsPre`/`evalSigStepsPost` split preserved
- Benchmark command: `npm run bench` — compare before/after

## 7. Migration Checklist

1. Add new types to `types.ts` (StepEvalValue, EvalTarget, EvalStrategy)
2. Update Step union
3. Update IRBuilderImpl methods
4. Update schedule-program.ts step construction
5. Update ScheduleExecutor.ts dispatch
6. Update all test files referencing evalSig/evalEvent
7. Delete StepEvalSig and StepEvalEvent interfaces
8. Run `npm run typecheck` — TypeScript compiler finds remaining references
9. Run `npm run test` — verify behavior unchanged
10. Run `npm run bench` — verify no performance regression
11. Un-skip enforcement test 4
