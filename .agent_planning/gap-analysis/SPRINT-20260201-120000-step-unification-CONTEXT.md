# SUPERSEDED — See SPRINT-20260201-140000-step-format-CONTEXT.md
# Implementation Context: Step-Unification

Generated: 2026-02-01T12:00:00Z
Source: EVALUATION-20260201-120000.md
Confidence: LOW

## 1. Current Step Kind System

### Step union definition
**File**: `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts`, lines 240-249
```typescript
export type Step =
  | StepEvalSig           // kind: 'evalSig' (line 252)
  | StepSlotWriteStrided  // strided multi-component write
  | StepMaterialize       // field materialization
  | StepRender            // render operations
  | StepStateWrite        // scalar state write
  | StepFieldStateWrite   // field state write
  | StepContinuityMapBuild
  | StepContinuityApply
  | StepEvalEvent;        // kind: 'evalEvent' (line 353)
```

### StepEvalSig (line 251-255)
```typescript
export interface StepEvalSig {
  readonly kind: 'evalSig';
  readonly expr: ValueExprId;
  readonly target: ValueSlot;
}
```

### StepEvalEvent (line 352-356)
```typescript
export interface StepEvalEvent {
  readonly kind: 'evalEvent';
  readonly expr: ValueExprId;
  readonly target: EventSlotId;
}
```

### Key difference
- `evalSig` writes to `ValueSlot` (float64 storage)
- `evalEvent` writes to `EventSlotId` (boolean/event storage)
- Both reference a `ValueExprId` pointing into the unified `ValueExpr` array

---

## 2. Schedule Executor Dispatch

### File: `/Users/bmf/code/oscilla-animator-v2/src/runtime/ScheduleExecutor.ts`

### Main switch (line 213)
```typescript
for (const step of steps) {
  switch (step.kind) {
    case 'evalSig': {
      // lines 214-255: Evaluate signal, write to slot
      // Uses resolveSlotOffset(step.target) to find storage location
      // Handles f64, f64vec (strided), i32 storage types
    }
    case 'evalEvent': {
      // lines 432-...: Evaluate event expression
      // Uses evaluateValueExprEvent() helper
      // Writes to event storage (boolean + scalar)
    }
    // ... other step kinds
  }
}
```

### Signal evaluation path (line 214)
```typescript
case 'evalSig': {
  const lookup = resolveSlotOffset(step.target);
  // ... evaluates expression and writes to appropriate storage
}
```

### Event evaluation path (line 432)
```typescript
case 'evalEvent': {
  const fired = evaluateValueExprEvent(step.expr as any, program.valueExprs, state, program);
  // ... writes to event storage
}
```

---

## 3. Schedule Construction

### File: `/Users/bmf/code/oscilla-animator-v2/src/compiler/backend/schedule-program.ts`

This pass generates `StepEvalSig` and `StepEvalEvent` steps. The step kind is determined by the expression's purpose (signal vs event), not by its `CanonicalType`.

### How steps are created
Search for `evalSig` and `evalEvent` in this file to find the construction sites. The schedule builder determines step kind based on the block lowering output, which already categorizes expressions as signal/field/event.

---

## 4. RuntimeState Storage Model

### File: `/Users/bmf/code/oscilla-animator-v2/src/runtime/RuntimeState.ts`

### Value storage (line ~498)
```typescript
state: Float64Array  // Flat array for all persistent state
```

### Event storage (line ~551-577)
```typescript
eventScalars: Float64Array     // Event scalar values
eventPrevPredicate: Uint8Array // Previous frame event state
events: Uint8Array             // Current frame event fire state
```

### Frame cache
Signal and field values are stored in the frame cache during execution, then cleared each frame.

---

## 5. Lane Identity - Current State

### Field state writes
In `ScheduleExecutor.ts`, field state writes (line ~562):
```typescript
state.state[baseSlot + i] = src[i];  // Implicit offset math
```

No metadata tracks which `i` maps to which instance/lane. The offset is purely positional.

### Instance count from IR
Instance declarations in `types.ts`:
```typescript
export interface InstanceDecl {
  readonly count: number;
  readonly domainType: string;
  // ...
}
```
The instance count determines how many lanes exist, but the mapping is implicit.

---

## 6. Files to Read for Research

### Primary
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts` - Full Step union, slot types
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/ScheduleExecutor.ts` - Full executor switch
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/backend/schedule-program.ts` - Step construction
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/RuntimeState.ts` - Storage model

### Secondary
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/Materializer.ts` - Field materialization
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/FieldKernels.ts` - Field kernel evaluation
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/StateMigration.ts` - Hot-swap state migration (lane remapping)
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/value-expr.ts` - ValueExpr with CanonicalType

### Design docs
- `/Users/bmf/code/oscilla-animator-v2/design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` - Core spec
- `/Users/bmf/code/oscilla-animator-v2/.claude/rules/TYPE-SYSTEM-INVARIANTS.md` - Guardrail #2

---

## 7. Open Questions for User

These must be answered before this sprint can reach HIGH confidence:

1. **Decision #6 (Cardinality polymorphism)**: Type variables vs runtime dispatch for cardinality-generic blocks?
   - Impacts whether step dispatch needs to handle polymorphic cardinality at runtime

2. **Decision #9 (ValueSlot vs explicit keying)**: Is opaque ValueSlot sufficient or need (ValueExprId, lane)?
   - Impacts lane identity tracking design

3. **Performance budget**: What is the acceptable overhead per step per frame?
   - Current: ~0 overhead (direct switch)
   - Option A: 2 property reads per step (type.extent.temporality + cardinality)
   - Option B/C: ~0 overhead (pre-resolved)

4. **Migration strategy**: Big-bang replacement or incremental migration with both old and new step kinds?
