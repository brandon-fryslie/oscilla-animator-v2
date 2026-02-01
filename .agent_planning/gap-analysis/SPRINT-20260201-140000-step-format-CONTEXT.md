# Implementation Context: Step Format Unification

Generated: 2026-02-01T14:00:00Z

## 1. Current Step System

### Step union (src/compiler/ir/types.ts:240-249)
```typescript
export type Step =
  | StepEvalSig           // kind: 'evalSig'
  | StepSlotWriteStrided
  | StepMaterialize
  | StepRender
  | StepStateWrite
  | StepFieldStateWrite
  | StepContinuityMapBuild
  | StepContinuityApply
  | StepEvalEvent;        // kind: 'evalEvent'
```

### StepEvalSig (line 252)
```typescript
interface StepEvalSig {
  kind: 'evalSig';
  expr: ValueExprId;
  target: ValueSlot;
}
```

### StepEvalEvent (line 353)
```typescript
interface StepEvalEvent {
  kind: 'evalEvent';
  expr: ValueExprId;
  target: EventSlotId;
}
```

### Executor switch (ScheduleExecutor.ts:213)
```typescript
switch (step.kind) {
  case 'evalSig': { /* signal evaluation path */ }
  case 'evalEvent': { /* event evaluation path */ }
  // ... other step kinds
}
```

## 2. Target Step Model

### Unified step
```typescript
// Pre-resolved strategy, derived from CanonicalType during schedule construction
type EvalStrategy = 'continuous_one' | 'continuous_many' | 'discrete_one' | 'discrete_many';

interface StepEvalValue {
  kind: 'evalValue';
  expr: ValueExprId;
  target: ValueSlot | EventSlotId;  // or unified SlotId
  strategy: EvalStrategy;
}
```

### Strategy derivation (in schedule-program.ts)
```typescript
function deriveStrategy(type: CanonicalType): EvalStrategy {
  const temp = type.extent.temporality;
  const card = type.extent.cardinality;
  if (temp.kind === 'inst' && temp.value === 'discrete') {
    return card.kind === 'inst' && card.value.kind === 'many' ? 'discrete_many' : 'discrete_one';
  }
  return card.kind === 'inst' && card.value.kind === 'many' ? 'continuous_many' : 'continuous_one';
}
```

### Executor dispatch
```typescript
case 'evalValue': {
  switch (step.strategy) {
    case 'continuous_one': { /* same as current evalSig scalar path */ }
    case 'continuous_many': { /* same as current field materialization path */ }
    case 'discrete_one': { /* same as current evalEvent path */ }
    case 'discrete_many': { /* field event path */ }
  }
}
```

## 3. Files to Modify

| File | Change |
|------|--------|
| `src/compiler/ir/types.ts` | Replace StepEvalSig + StepEvalEvent with StepEvalValue |
| `src/compiler/backend/schedule-program.ts` | Emit StepEvalValue with pre-resolved strategy |
| `src/runtime/ScheduleExecutor.ts` | Dispatch on strategy instead of kind |
| `src/__tests__/forbidden-patterns.test.ts` | Un-skip enforcement test 4 |
| Test files referencing evalSig/evalEvent | Update step kind references |

## 4. What NOT to Change (Deferred)

- `RuntimeState.state: Float64Array` layout — keep flat, no branch scoping
- Event storage model — keep `eventScalars`, `eventPrevPredicate`, `events` separate
- Lane identity tracking — keep implicit offset math
- Stamp buffers — not implemented, not needed yet
- `StepMaterialize`, `StepRender`, etc. — keep as-is unless they naturally simplify

## 5. Performance Notes

The strategy enum switch has identical performance to the current string switch:
- V8 optimizes both patterns the same way (hidden class + inline caching)
- Pre-resolved strategy means zero additional work per step per frame
- Benchmark with `npm run bench` to confirm
