# Implementation Context: time-normalization

Generated: 2026-01-25
Plan: SPRINT-20260125-time-normalization-PLAN.md

## P0: Remove Reserved Slot 0

### Target Files

1. **src/compiler/ir/IRBuilderImpl.ts** (lines 99-108)
   - DELETE: `reserveSystemSlot` method
   - DELETE: Call in constructor: `this.reserveSystemSlot(0, signalType('color'))`
   - DELETE: `private reservedSlots = new Map<number, SignalType>()`

2. **src/runtime/ScheduleExecutor.ts** (lines 27-28)
   - DELETE: `const TIME_PALETTE_SLOT = 0 as ValueSlot;`

3. **src/runtime/ScheduleExecutor.ts** (lines 155-160)
   - CHANGE: Remove hardcoded palette slot write
   ```typescript
   // BEFORE
   const palette = time.palette;
   writeF64Strided(state, TIME_PALETTE_SLOT, palette, 4);

   // AFTER
   // Palette written by InfiniteTimeRoot's writeSlot step
   ```

### Communication of Time Slots

Options for passing time slot IDs from compiler to runtime:

**Option A: Add to ScheduleIR**
```typescript
export interface ScheduleIR {
  // ... existing fields ...
  timeSlots?: {
    tMs: ValueSlot;
    dt: ValueSlot;
    phaseA: ValueSlot;
    phaseB: ValueSlot;
    palette: ValueSlot;
    energy: ValueSlot;
  };
}
```

**Option B: Emit writeSlot steps (PREFERRED)**

InfiniteTimeRoot block emits writeSlot steps that read from time system:
```typescript
// In InfiniteTimeRoot lower function
const { slot: tMsSlot } = ctx.b.allocSlot(signalType('float'));
ctx.b.emitSlotWrite(tMsSlot, [ctx.b.sigTime('tMs', type)]);
```

Option B is cleaner - no special ScheduleIR fields, time flows through normal mechanism.

---

## P1: Update InfiniteTimeRoot Block

### Target File

**src/blocks/time-blocks.ts** (lines 40-80)

### Current Code

```typescript
lower: ({ ctx }): LowerResult => {
  const tMs = ctx.b.sigTime('tMs', signalType('float'));
  const dt = ctx.b.sigTime('dt', signalType('float'));
  const phaseA = ctx.b.sigTime('phaseA', signalType('float', unitPhase01()));
  // ...

  const tMsSlot = ctx.b.allocSlot();
  const dtSlot = ctx.b.allocSlot();
  // ...

  return {
    outputsById: {
      tMs: { k: 'sig', id: tMs, slot: tMsSlot, type: tMsType, stride: 1 },
      // ...
    },
  };
}
```

### New Code

```typescript
lower: ({ ctx }): LowerResult => {
  // Allocate slots through normal mechanism
  const { slot: tMsSlot, stride: tMsStride } = ctx.b.allocSlot(signalType('float'));
  const { slot: dtSlot, stride: dtStride } = ctx.b.allocSlot(signalType('float'));
  const { slot: phaseASlot } = ctx.b.allocSlot(signalType('float', unitPhase01()));
  const { slot: phaseBSlot } = ctx.b.allocSlot(signalType('float', unitPhase01()));
  const { slot: paletteSlot } = ctx.b.allocSlot(signalType('color')); // stride=4
  const { slot: energySlot } = ctx.b.allocSlot(signalType('float'));

  // Create time signal expressions
  const tMs = ctx.b.sigTime('tMs', signalType('float'));
  const dt = ctx.b.sigTime('dt', signalType('float'));
  const phaseA = ctx.b.sigTime('phaseA', signalType('float', unitPhase01()));
  const phaseB = ctx.b.sigTime('phaseB', signalType('float', unitPhase01()));
  const energy = ctx.b.sigTime('energy', signalType('float'));

  // Emit slot writes for time values
  ctx.b.emitSlotWrite(tMsSlot, [tMs]);
  ctx.b.emitSlotWrite(dtSlot, [dt]);
  ctx.b.emitSlotWrite(phaseASlot, [phaseA]);
  ctx.b.emitSlotWrite(phaseBSlot, [phaseB]);
  ctx.b.emitSlotWrite(energySlot, [energy]);

  // Palette is 4 components - need 4 time expressions
  const paletteR = ctx.b.sigTime('palette', signalType('float')); // component 0
  const paletteG = ctx.b.sigTime('palette', signalType('float')); // component 1
  const paletteB = ctx.b.sigTime('palette', signalType('float')); // component 2
  const paletteA = ctx.b.sigTime('palette', signalType('float')); // component 3
  ctx.b.emitSlotWrite(paletteSlot, [paletteR, paletteG, paletteB, paletteA]);

  // ... rest unchanged
}
```

### Palette Component Challenge

The palette is a color (4 components) but sigTime returns a single value. Options:

1. **Extend sigTime to support component index**
   ```typescript
   sigTime('palette', type, componentIndex?: number)
   ```

2. **Create separate SigExprTime for each component**
   ```typescript
   sigTimeComponent('palette', 0, type) // red
   sigTimeComponent('palette', 1, type) // green
   // ...
   ```

3. **Have a single "read palette to buffer" step**
   ```typescript
   // New step type
   { kind: 'writeTimeValue', timeField: 'palette', target: paletteSlot }
   ```

Option 3 may be simplest - adds one new step type but avoids complexity in signal expressions.

---

## P2: Remove SigExprTime Direct Access

### Target File

**src/runtime/SignalEvaluator.ts** (lines 149-172)

### Current Code

```typescript
case 'time': {
  const timeExpr = expr as { which: 'tMs' | 'phaseA' | ... };
  switch (timeExpr.which) {
    case 'tMs':
      return state.time.tMs;
    case 'dt':
      return state.time.dt;
    case 'phaseA':
      return state.time.phaseA;
    case 'phaseB':
      return state.time.phaseB;
    case 'progress':
      return state.time.progress ?? 0;
    case 'palette':
      return 0; // Slot number for palette - WEIRD!
    case 'energy':
      return state.time.energy;
    default: {
      const _exhaustive: never = timeExpr.which;
      throw new Error(`Unknown time signal: ${String(_exhaustive)}`);
    }
  }
}
```

### Analysis

The `palette` case returning 0 is suspicious - it returns the slot number, not the palette value. This suggests palette was never properly integrated into the signal evaluation system.

### Proposed Change

After P1 (time values written to slots), time expressions could:
1. Continue to read from state.time (caching benefit)
2. Read from slots (consistency)

For minimal change, keep the case but ensure it's only used for time expressions that haven't been slot-written yet (edge case during transition).

Long term: remove SigExprTime entirely and have all time access go through slots.

---

## ScheduleExecutor Time Writing

### Current Flow

```
resolveTime(state.timeState, ...) -> EffectiveTime
state.time = effectiveTime
writeF64Strided(state, TIME_PALETTE_SLOT, palette, 4)  // HARDCODED
```

### New Flow (After P1)

```
resolveTime(state.timeState, ...) -> EffectiveTime
state.time = effectiveTime
// InfiniteTimeRoot's writeSlot steps run (part of normal schedule)
// - Evaluates sigTime expressions
// - Writes to allocated slots
```

The key insight: sigTime expressions read from state.time, then writeSlot writes to slots. Downstream signals read from slots via sigSlot.

This creates a "time → slots → downstream" flow instead of "time → (parallel reads from state.time)".

---

## Performance Considerations

Current (direct access):
- Downstream signal evaluates
- Hits `case 'time':` in SignalEvaluator
- Returns state.time.field directly
- Cache stores result

New (slot indirection):
- InfiniteTimeRoot writeSlot runs
- Evaluates sigTime (reads state.time)
- Writes to slot
- Downstream signal evaluates
- Hits `case 'slot':` in SignalEvaluator
- Reads from state.values.f64[offset]
- Cache stores result

The new approach adds:
- One extra slot write per time field per frame
- Slot read instead of direct field access

This is ~7 extra f64 writes (tMs, dt, phaseA, phaseB, energy, palette x4) per frame. Negligible.

The cache ensures downstream signals don't re-evaluate, so the indirection is amortized.
