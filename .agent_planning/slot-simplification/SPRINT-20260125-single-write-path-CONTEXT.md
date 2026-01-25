# Implementation Context: single-write-path

Generated: 2026-01-25
Plan: SPRINT-20260125-single-write-path-PLAN.md

## P0: Design Unified Write Step

### Current Step Types (src/compiler/ir/types.ts lines 433-470)

```typescript
export interface StepEvalSig {
  readonly kind: 'evalSig';
  readonly expr: SigExprId;
  readonly target: ValueSlot;
}

export interface StepSlotWriteStrided {
  readonly kind: 'slotWriteStrided';
  readonly slotBase: ValueSlot;
  readonly inputs: readonly SigExprId[];
}
```

### Proposed Unified Step

```typescript
export interface StepWriteSlot {
  readonly kind: 'writeSlot';
  readonly target: ValueSlot;
  readonly inputs: readonly SigExprId[];  // length = stride
}
```

### Migration Path

| Old Step | New Step |
|----------|----------|
| `{ kind: 'evalSig', expr: id, target: slot }` | `{ kind: 'writeSlot', target: slot, inputs: [id] }` |
| `{ kind: 'slotWriteStrided', slotBase: slot, inputs: [a,b,c] }` | `{ kind: 'writeSlot', target: slot, inputs: [a,b,c] }` |

---

## P1: Update IRBuilder

### Target Files

1. **src/compiler/ir/IRBuilder.ts** (interface)
   - DELETE: `registerSigSlot(sigId: SigExprId, slot: ValueSlot): void`
   - DELETE: `stepSlotWriteStrided(slotBase: ValueSlot, inputs: readonly SigExprId[]): void`
   - DELETE: `getSigSlots(): ReadonlyMap<number, ValueSlot>`
   - ADD: `emitSlotWrite(target: ValueSlot, inputs: readonly SigExprId[]): void`

2. **src/compiler/ir/IRBuilderImpl.ts** (implementation)
   - DELETE: `private sigSlots = new Map<number, ValueSlot>()`
   - DELETE: `registerSigSlot` method (lines 733-735)
   - DELETE: `stepSlotWriteStrided` method (lines 694-699)
   - DELETE: `getSigSlots` method (lines 823-825)
   - ADD: `private slotWriteSteps: StepWriteSlot[] = []`
   - ADD: `emitSlotWrite(target, inputs)` implementation
   - ADD: `getSlotWriteSteps(): readonly StepWriteSlot[]`

### Code Pattern

```typescript
// IRBuilderImpl.ts
private slotWriteSteps: StepWriteSlot[] = [];

emitSlotWrite(target: ValueSlot, inputs: readonly SigExprId[]): void {
  this.slotWriteSteps.push({ kind: 'writeSlot', target, inputs });
}

getSlotWriteSteps(): readonly StepWriteSlot[] {
  return this.slotWriteSteps;
}
```

---

## P2: Update ScheduleExecutor

### Target File

**src/runtime/ScheduleExecutor.ts** (lines 184-248)

### Current Code (TO CHANGE)

```typescript
case 'evalSig': {
  const lookup = resolveSlotOffset(step.target);
  const { storage, offset, slot, stride } = lookup;

  if (storage === 'shape2d') {
    // Special shape handling...
  } else if (storage === 'f64') {
    if (stride !== 1) {
      throw new Error(`evalSig: expected stride=1...`);
    }
    const value = evaluateSignal(step.expr, signals, state);
    writeF64Scalar(state, lookup, value);
    state.tap?.recordSlotValue?.(slot, value);
    state.cache.sigValues[step.expr as number] = value;
    state.cache.sigStamps[step.expr as number] = state.cache.frameId;
  }
}

case 'slotWriteStrided': {
  const lookup = resolveSlotOffset(step.slotBase);
  const { storage, offset, stride } = lookup;

  if (storage !== 'f64') {
    throw new Error(`slotWriteStrided: expected f64 storage...`);
  }
  if (step.inputs.length !== stride) {
    throw new Error(`slotWriteStrided: inputs.length must equal stride...`);
  }

  for (let i = 0; i < step.inputs.length; i++) {
    const componentValue = evaluateSignal(step.inputs[i], signals, state);
    state.values.f64[offset + i] = componentValue;
    state.tap?.recordSlotValue?.((step.slotBase + i) as ValueSlot, componentValue);
  }
}
```

### New Code

```typescript
case 'writeSlot': {
  const lookup = resolveSlotOffset(step.target);
  const { storage, offset, slot } = lookup;

  if (storage === 'shape2d') {
    // Shape handling - only single input expected
    const exprNode = signals[step.inputs[0] as number];
    if (exprNode.kind === 'shapeRef') {
      writeShape2D(state.values.shape2d, offset, {
        topologyId: exprNode.topologyId,
        pointsFieldSlot: (exprNode.controlPointField as number) ?? 0,
        pointsCount: 0,
        styleRef: 0,
        flags: 0,
      });
    }
  } else if (storage === 'f64') {
    // Unified write path for all numeric slots
    for (let i = 0; i < step.inputs.length; i++) {
      const value = evaluateSignal(step.inputs[i], signals, state);
      state.values.f64[offset + i] = value;
      state.tap?.recordSlotValue?.((step.target + i) as ValueSlot, value);
    }
  }
}
```

### Debug Tap Changes

Current debug tap records per-component:
```typescript
state.tap?.recordSlotValue?.(slot, value);
```

New approach - still per-component, but using offset + i pattern. No change to tap interface.

---

## P2: Update pass7-schedule.ts

### Target File

**src/compiler/passes-v2/pass7-schedule.ts** (lines 442-530)

### Current Code Structure (TO SIMPLIFY)

```typescript
// Collect slots that are targets of slotWriteStrided steps
const stridedWriteSlots = new Set<ValueSlot>();
for (const step of builderSteps) {
  if (step.kind === 'slotWriteStrided') {
    stridedWriteSlots.add(step.slotBase);
  }
}

// Generate evalSig steps for all signals with registered slots
const sigSlots = unlinkedIR.builder.getSigSlots();
const evalSigStepsPre: Step[] = [];
const evalSigStepsPost: Step[] = [];
for (const [sigId, slot] of sigSlots) {
  // Skip slots that are written by slotWriteStrided
  if (stridedWriteSlots.has(slot)) {
    continue;
  }
  const step = { kind: 'evalSig', expr: sigId, target: slot };
  if (sigDependsOnEvent(sigId, signals)) {
    evalSigStepsPost.push(step);
  } else {
    evalSigStepsPre.push(step);
  }
}

// Separate builder steps by kind
const slotWriteStridedSteps: Step[] = [];
const stateWriteSteps: Step[] = [];
for (const step of builderSteps) {
  if (step.kind === 'slotWriteStrided') {
    slotWriteStridedSteps.push(step);
  } else if (step.kind === 'stateWrite' || step.kind === 'fieldStateWrite') {
    stateWriteSteps.push(step);
  }
}

// Combine in order
const steps: Step[] = [
  ...evalSigStepsPre,
  ...slotWriteStridedSteps,
  ...mapBuildSteps,
  // ...
];
```

### New Code Structure

```typescript
// Get all slot write steps from builder (already in correct emission order)
const slotWriteSteps = unlinkedIR.builder.getSlotWriteSteps();

// Separate by event dependency
const slotWritesPre: Step[] = [];
const slotWritesPost: Step[] = [];
for (const step of slotWriteSteps) {
  // Check if ANY input depends on event
  const dependsOnEvent = step.inputs.some(id => sigDependsOnEvent(id as number, signals));
  if (dependsOnEvent) {
    slotWritesPost.push(step);
  } else {
    slotWritesPre.push(step);
  }
}

// Get state write steps from builder
const stateWriteSteps = unlinkedIR.builder.getSteps()
  .filter(s => s.kind === 'stateWrite' || s.kind === 'fieldStateWrite');

// Combine in order
const steps: Step[] = [
  ...slotWritesPre,
  ...mapBuildSteps,
  ...materializeSteps,
  ...continuityApplySteps,
  ...evalEventSteps,
  ...slotWritesPost,
  ...renderSteps,
  ...stateWriteSteps,
];
```

---

## Block Lowering Changes

Blocks must change from:

```typescript
// Scalar signal
const sigId = ctx.b.sigConst(value, type);
const slot = ctx.b.allocSlot(stride);
ctx.b.registerSigSlot(sigId, slot);  // DELETE THIS
ctx.b.emitSlotWrite(slot, [sigId]);   // ADD THIS

// Multi-component signal
const slot = ctx.b.allocSlot(stride);
ctx.b.stepSlotWriteStrided(slot, [xSig, ySig]);  // RENAME
ctx.b.emitSlotWrite(slot, [xSig, ySig]);          // TO THIS
```

Most blocks already call stepSlotWriteStrided, so renaming is mechanical.

The significant change is blocks that rely on pass7 auto-generating evalSig from registerSigSlot. These must explicitly call emitSlotWrite.

---

## Files Changed Summary

| File | Change Type |
|------|-------------|
| src/compiler/ir/types.ts | Add StepWriteSlot, deprecate StepEvalSig, StepSlotWriteStrided |
| src/compiler/ir/IRBuilder.ts | Add emitSlotWrite, delete registerSigSlot, stepSlotWriteStrided, getSigSlots |
| src/compiler/ir/IRBuilderImpl.ts | Implement emitSlotWrite, delete old methods |
| src/compiler/passes-v2/pass7-schedule.ts | Simplify to use getSlotWriteSteps |
| src/runtime/ScheduleExecutor.ts | Single writeSlot case |
| src/blocks/*.ts | Replace registerSigSlot with emitSlotWrite |
