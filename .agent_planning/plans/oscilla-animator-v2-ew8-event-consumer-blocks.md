# Plan: Event Consumer Blocks (oscilla-animator-v2-ew8)

## Goal

Implement `EventToSignalMask` and `SampleHold` blocks that bridge the event→signal domain, making the event system usable for driving animations.

## Context

The event system is already implemented with:
- `EventExpr` types (const, pulse, wrap, combine, never)
- `EventEvaluator.evaluateEvent()` → boolean per tick
- `StepEvalEvent` that writes to `state.eventScalars[slot]` (Uint8Array, 0 or 1)
- `eventScalars` cleared to 0 each frame, then monotone-OR'd to 1 if any event fires

The signal system has:
- `SigExpr` types (const, slot, time, external, map, zip, stateRead, shapeRef)
- `evaluateSignal()` in SignalEvaluator
- State read/write via `sigStateRead` / `stepStateWrite`
- `OpCode.Lerp` for 3-arg lerp(a, b, t) — perfect for conditional logic

**Key gap**: There is no way to read `eventScalars[slot]` as a signal value. We need a new `SigExprEventRead` kind.

## Architecture Decision

### Event→Signal Bridge: `SigExprEventRead`

A new SigExpr kind that reads from `state.eventScalars[eventSlot]` and returns it as a float (0.0 or 1.0).

This is the canonical one-way event→signal bridge. It does NOT coerce — it explicitly converts a discrete boolean event result into a continuous signal, which is what spec §9.2 demands ("explicit adapters/blocks for event ↔ numeric").

### SampleHold: Lerp-based conditional

Instead of needing a new conditional state write step, SampleHold uses `lerp(prevValue, inputValue, eventScalar)`:
- When event fires: `eventScalar = 1.0` → `lerp(prev, input, 1.0) = input` → state captures input
- When event doesn't fire: `eventScalar = 0.0` → `lerp(prev, input, 0.0) = prev` → state holds

The state write is always unconditional (writes the lerp result every frame), but the lerp itself provides the conditional behavior. This avoids adding new step types.

## Implementation Steps

### Step 1: Add `SigExprEventRead` to IR types

**File**: `src/compiler/ir/types.ts`

Add to the `SigExpr` union:
```typescript
export type SigExpr =
  | SigExprConst
  | SigExprSlot
  | SigExprTime
  | SigExprExternal
  | SigExprMap
  | SigExprZip
  | SigExprStateRead
  | SigExprShapeRef
  | SigExprEventRead;  // NEW

export interface SigExprEventRead {
  readonly kind: 'eventRead';
  readonly eventSlot: EventSlotId;
  readonly type: CanonicalType;  // Always canonicalType('float')
}
```

### Step 2: Add `sigEventRead` to IRBuilder interface + impl

**File**: `src/compiler/ir/IRBuilder.ts`

Add method:
```typescript
/** Create a signal that reads the fired/not-fired state of an event slot as float (0.0 or 1.0). */
sigEventRead(eventSlot: EventSlotId, type: CanonicalType): SigExprId;
```

**File**: `src/compiler/ir/IRBuilderImpl.ts`

Implement:
```typescript
sigEventRead(eventSlot: EventSlotId, type: CanonicalType): SigExprId {
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({ kind: 'eventRead', eventSlot, type });
  return id;
}
```

### Step 3: Handle `'eventRead'` in SignalEvaluator

**File**: `src/runtime/SignalEvaluator.ts`

Add case in `evaluateSignal()`:
```typescript
case 'eventRead': {
  // Read from event scalars: 0 → 0.0, 1 → 1.0
  return state.eventScalars[expr.eventSlot as number] ?? 0;
}
```

### Step 4: Register `EventToSignalMask` block

**File**: `src/blocks/event-blocks.ts` (NEW)

```typescript
registerBlock({
  type: 'EventToSignalMask',
  label: 'Event → Signal',
  category: 'event',
  description: 'Outputs 1.0 on the tick an event fires, 0.0 otherwise',
  form: 'primitive',
  capability: 'pure',  // No state needed — reads event scalar each frame
  inputs: {
    event: { label: 'Event', type: canonicalType('bool') },  // Event input port
  },
  outputs: {
    out: { label: 'Signal', type: canonicalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const eventInput = inputsById.event;
    if (!eventInput || eventInput.k !== 'event') {
      throw new Error('EventToSignalMask: event input must be an event');
    }

    // Read the event scalar as a float signal
    const sigId = ctx.b.sigEventRead(eventInput.slot, canonicalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});
```

### Step 5: Register `SampleHold` block

**File**: `src/blocks/event-blocks.ts` (same file)

```typescript
registerBlock({
  type: 'SampleHold',
  label: 'Sample & Hold',
  category: 'event',
  description: 'Latches input value when event fires, holds until next fire',
  form: 'primitive',
  capability: 'state',
  inputs: {
    value: { label: 'Value', type: canonicalType('float') },
    trigger: { label: 'Trigger', type: canonicalType('bool') },  // Event input port
    initialValue: { type: canonicalType('float'), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Held', type: canonicalType('float') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const valueInput = inputsById.value;
    const triggerInput = inputsById.trigger;

    if (!valueInput || valueInput.k !== 'sig') {
      throw new Error('SampleHold: value input must be a signal');
    }
    if (!triggerInput || triggerInput.k !== 'event') {
      throw new Error('SampleHold: trigger input must be an event');
    }

    const initialValue = (config?.initialValue as number) ?? 0;

    // Allocate persistent state slot
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'sample'),
      { initialValue }
    );

    // Read previous held value (Phase 1)
    const prevId = ctx.b.sigStateRead(stateSlot, canonicalType('float'));

    // Read event scalar as float (0.0 or 1.0)
    const triggerSig = ctx.b.sigEventRead(triggerInput.slot, canonicalType('float'));

    // Conditional: lerp(prev, value, trigger)
    // trigger=0 → prev, trigger=1 → value
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const outputId = ctx.b.sigZip(
      [prevId, valueInput.id as SigExprId, triggerSig],
      lerpFn,
      canonicalType('float')
    );

    // Write output to state for next frame (Phase 2)
    ctx.b.stepStateWrite(stateSlot, outputId);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: outputId, slot },
      },
    };
  },
});
```

### Step 6: Register event-blocks in module loader

Ensure `src/blocks/event-blocks.ts` is imported alongside existing block files. Check where signal-blocks.ts / math-blocks.ts are imported.

### Step 7: Tests

**File**: `src/blocks/__tests__/event-blocks.test.ts` (NEW)

Test cases:
1. **EventToSignalMask**: Compile pulse→EventToSignalMask, execute frames, verify output is 1.0 every frame
2. **EventToSignalMask**: Compile wrap(signal)→EventToSignalMask, verify output is 1.0 only on rising edge frames
3. **SampleHold**: Trigger never fires → output stays at initialValue (0)
4. **SampleHold**: Trigger fires on frame N → output captures input value at frame N, holds on subsequent frames
5. **SampleHold**: Multiple fires → output updates to latest value each time trigger fires
6. **SampleHold**: Hot-swap preserves held value (state migration via stableStateId)

## Execution Order & Dependencies

```
Step 1 (types.ts) → Step 2 (IRBuilder) → Step 3 (SignalEvaluator) → Step 4+5 (blocks) → Step 6 (imports) → Step 7 (tests)
```

Steps 1-3 are the foundational `SigExprEventRead` plumbing.
Steps 4-5 are the block registrations that use it.
Step 6 is wiring.
Step 7 validates end-to-end.

## Verification Criteria

- `npm run typecheck` passes
- `npm run test` passes (existing tests unbroken)
- New tests in `event-blocks.test.ts` pass
- EventToSignalMask: compile→execute→verify signal values are correct
- SampleHold: compile→execute multi-frame→verify hold behavior

## Spec Conformance

- §9.2.1 EventToSignalMask: ✅ Explicit event→signal bridge, output 1.0 on fire frame, 0.0 otherwise
- §9.2.2 SampleHold: ✅ Latches input on trigger, holds until next trigger, uses state slot
- §6.1 Event clearing: ✅ eventScalars cleared per frame, eventRead just reads current value
- No implicit coercion: ✅ The event→signal bridge is an explicit block, not an implicit cast
