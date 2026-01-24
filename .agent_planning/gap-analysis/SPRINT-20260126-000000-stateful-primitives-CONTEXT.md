# Implementation Context: stateful-primitives
Generated: 2026-01-26T00:00:00Z
Source: EVALUATION-20260125-234400.md
Confidence: HIGH

## File Locations

### Primary implementation file
- `src/blocks/signal-blocks.ts` — Add Lag and Phasor registrations after UnitDelay (after line 279)

### Test file
- `src/blocks/__tests__/stateful-primitives.test.ts` — Add new `describe` blocks after line 146 (after Hash Block tests start)

### Registry type (for reference, do NOT modify)
- `src/blocks/registry.ts:244-254` — BlockDef type showing `capability` and `isStateful` fields

### SCC pass (for reference, verify behavior)
- `src/compiler/passes-v2/pass5-scc.ts:115` — Checks `blockDef.isStateful === true`

---

## U-4: Lag Block Implementation

### Imports already available in signal-blocks.ts (line 7-10)
```typescript
import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, type PayloadType, unitPhase01, unitNorm01 } from '../core/canonical-types';
import { OpCode, stableStateId } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';
```

All needed imports are already present. No new imports required.

### Registration pattern (copy from UnitDelay at lines 229-279)
Insert after line 279 (after UnitDelay's closing `});`), before the Hash block section.

```typescript
// =============================================================================
// Lag - Exponential smoothing filter
// =============================================================================

registerBlock({
  type: 'Lag',
  label: 'Lag (Smooth)',
  category: 'signal',
  description: 'Exponential smoothing toward target. y(t) = lerp(y(t-1), target, smoothing)',
  form: 'primitive',
  capability: 'state',
  isStateful: true,
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    target: { label: 'Target', type: signalType('float') },
    smoothing: { type: signalType('float'), value: 0.1, exposedAsPort: false },
    initialValue: { type: signalType('float'), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const targetInput = inputsById.target;
    if (!targetInput || targetInput.k !== 'sig') {
      throw new Error('Lag target input must be a signal');
    }

    const smoothing = (config?.smoothing as number) ?? 0.1;
    const initialValue = (config?.initialValue as number) ?? 0;

    // Allocate persistent state slot with stable ID
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'lag'),
      { initialValue }
    );

    // Read previous value (Phase 1)
    const prevId = ctx.b.sigStateRead(stateSlot, signalType('float'));

    // Compute: lerp(prev, target, smoothing)
    const smoothConst = ctx.b.sigConst(smoothing, signalType('float'));
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const outputId = ctx.b.sigZip(
      [prevId, targetInput.id as SigExprId, smoothConst],
      lerpFn,
      signalType('float')
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

### Key differences from UnitDelay
1. UnitDelay outputs PREVIOUS value (`prevId`), Lag outputs NEW smoothed value (`outputId`)
2. Lag uses Lerp opcode (3-arg zip: prev, target, smoothing)
3. Lag writes the OUTPUT to state, UnitDelay writes the INPUT to state
4. Lag has `isStateful: true` (UnitDelay should also but does not currently)

---

## U-5: Phasor Block Implementation

### Insert after Lag block, before Hash block section

```typescript
// =============================================================================
// Phasor - Phase accumulator with wrap
// =============================================================================

registerBlock({
  type: 'Phasor',
  label: 'Phasor',
  category: 'signal',
  description: 'Phase accumulator 0..1 with wrap. Distinct from Accumulator (unbounded)',
  form: 'primitive',
  capability: 'state',
  isStateful: true,
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    frequency: { label: 'Frequency', type: signalType('float') },
    initialPhase: { type: signalType('float'), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Phase', type: signalType('float', unitPhase01()) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const freqInput = inputsById.frequency;
    if (!freqInput || freqInput.k !== 'sig') {
      throw new Error('Phasor frequency input must be a signal');
    }

    const initialPhase = (config?.initialPhase as number) ?? 0;

    // Allocate persistent state slot
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'phasor'),
      { initialValue: initialPhase }
    );

    // Read previous phase (Phase 1)
    const prevPhase = ctx.b.sigStateRead(stateSlot, signalType('float'));

    // Get dt from time system (in ms)
    const dtMs = ctx.b.sigTime('dt', signalType('float'));

    // Convert dt from ms to seconds: dtSec = dt * 0.001
    const msToSec = ctx.b.sigConst(0.001, signalType('float'));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const dtSec = ctx.b.sigZip([dtMs, msToSec], mulFn, signalType('float'));

    // Compute phase increment: increment = frequency * dtSec
    const increment = ctx.b.sigZip(
      [freqInput.id as SigExprId, dtSec],
      mulFn,
      signalType('float')
    );

    // Accumulate: rawPhase = prev + increment
    const addFn = ctx.b.opcode(OpCode.Add);
    const rawPhase = ctx.b.sigZip([prevPhase, increment], addFn, signalType('float'));

    // Wrap to [0, 1): newPhase = wrap01(rawPhase)
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const newPhase = ctx.b.sigMap(rawPhase, wrapFn, signalType('float', unitPhase01()));

    // Write new phase to state for next frame (Phase 2)
    ctx.b.stepStateWrite(stateSlot, newPhase);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: newPhase, slot },
      },
    };
  },
});
```

### Key design decisions
1. **dt access**: Uses `ctx.b.sigTime('dt', ...)` — available to any block, not just TimeRoot (see `src/compiler/ir/IRBuilder.ts:44`)
2. **Output is NEW phase**: Unlike UnitDelay (outputs prev), Phasor outputs post-wrap value
3. **Wrap via sigMap**: `OpCode.Wrap01` is a unary op, applied via `sigMap` not `sigZip`
4. **Frequency is wirable**: Unlike Lag's smoothing (config only), frequency can be dynamically modulated

### Wrap01 behavior
`OpCode.Wrap01` maps values to [0, 1) range. Confirmed in use at:
- `src/blocks/adapter-blocks.ts:88` — `const wrapFn = ctx.b.opcode(OpCode.Wrap01);`
- `src/blocks/adapter-blocks.ts:160` — same pattern
- `src/expr/compile.ts:301` — used for `wrap` and `fract` functions

---

## Test Implementation

### File: `src/blocks/__tests__/stateful-primitives.test.ts`
### Insert after line 146 (after `describe('UnitDelay Block', ...)` closing brace, before `describe('Hash Block', ...)`)

### Test pattern (follows UnitDelay test structure at lines 17-145)

```typescript
describe('Lag Block', () => {
  it('compiles with a state slot', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 10 });
      const lagBlock = b.addBlock('Lag', { smoothing: 0.5 });
      b.wire(constBlock, 'out', lagBlock, 'target');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const schedule = result.program.schedule as any;
    expect(schedule.stateSlotCount).toBe(1);
    expect(schedule.stateSlots[0].initialValue).toBe(0);
  });

  it('smooths toward target value over multiple frames', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 10 });
      const lagBlock = b.addBlock('Lag', { smoothing: 0.5 });
      b.wire(constBlock, 'out', lagBlock, 'target');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Frame 1: lerp(0, 10, 0.5) = 5
    executeFrame(program, state, pool, 0);
    expect(state.state[0]).toBeCloseTo(5, 5);

    // Frame 2: lerp(5, 10, 0.5) = 7.5
    executeFrame(program, state, pool, 16);
    expect(state.state[0]).toBeCloseTo(7.5, 5);

    // Frame 3: lerp(7.5, 10, 0.5) = 8.75
    executeFrame(program, state, pool, 32);
    expect(state.state[0]).toBeCloseTo(8.75, 5);
  });

  it('smoothing=1 snaps immediately to target', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 42 });
      const lagBlock = b.addBlock('Lag', { smoothing: 1.0 });
      b.wire(constBlock, 'out', lagBlock, 'target');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    executeFrame(program, state, pool, 0);
    expect(state.state[0]).toBeCloseTo(42, 5);
  });

  it('smoothing=0 produces no movement', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 100 });
      const lagBlock = b.addBlock('Lag', { smoothing: 0, initialValue: 5 });
      b.wire(constBlock, 'out', lagBlock, 'target');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Initialize state
    for (let i = 0; i < schedule.stateSlots.length; i++) {
      state.state[i] = schedule.stateSlots[i].initialValue;
    }

    executeFrame(program, state, pool, 0);
    expect(state.state[0]).toBeCloseTo(5, 5); // No movement
  });

  it('respects custom initial value', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 10 });
      const lagBlock = b.addBlock('Lag', { smoothing: 0.5, initialValue: 20 });
      b.wire(constBlock, 'out', lagBlock, 'target');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const schedule = result.program.schedule as any;
    expect(schedule.stateSlots[0].initialValue).toBe(20);
  });
});

describe('Phasor Block', () => {
  it('compiles with a state slot', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const freqBlock = b.addBlock('Const', { value: 1 }); // 1 Hz
      const phasorBlock = b.addBlock('Phasor', {});
      b.wire(freqBlock, 'out', phasorBlock, 'frequency');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const schedule = result.program.schedule as any;
    expect(schedule.stateSlotCount).toBe(1);
    expect(schedule.stateSlots[0].initialValue).toBe(0);
  });

  it('accumulates phase based on frequency and dt', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const freqBlock = b.addBlock('Const', { value: 1 }); // 1 Hz
      const phasorBlock = b.addBlock('Phasor', {});
      b.wire(freqBlock, 'out', phasorBlock, 'frequency');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Frame 1 at t=0, dt=0: phase stays at 0
    executeFrame(program, state, pool, 0);
    // dt=0 on first frame, so increment=0, phase stays 0
    expect(state.state[0]).toBeCloseTo(0, 5);

    // Frame 2 at t=1000 (dt=1000ms = 1s at 1Hz): phase = 0 + 1*1.0 = 1.0 → wraps to 0.0
    executeFrame(program, state, pool, 1000);
    expect(state.state[0]).toBeCloseTo(0, 1); // wraps

    // Frame at t=1500 (dt=500ms = 0.5s at 1Hz): phase = 0 + 1*0.5 = 0.5
    executeFrame(program, state, pool, 1500);
    expect(state.state[0]).toBeCloseTo(0.5, 3);
  });

  it('wraps phase at 1.0', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const freqBlock = b.addBlock('Const', { value: 2 }); // 2 Hz
      const phasorBlock = b.addBlock('Phasor', { initialPhase: 0.9 });
      b.wire(freqBlock, 'out', phasorBlock, 'frequency');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Initialize state with initialPhase
    for (let i = 0; i < schedule.stateSlots.length; i++) {
      state.state[i] = schedule.stateSlots[i].initialValue;
    }

    // dt=100ms at 2Hz: increment = 2 * 0.1 = 0.2
    // phase = wrap01(0.9 + 0.2) = wrap01(1.1) = 0.1
    executeFrame(program, state, pool, 100);
    expect(state.state[0]).toBeCloseTo(0.1, 3);
  });

  it('frequency=0 produces no phase advancement', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const freqBlock = b.addBlock('Const', { value: 0 });
      const phasorBlock = b.addBlock('Phasor', { initialPhase: 0.5 });
      b.wire(freqBlock, 'out', phasorBlock, 'frequency');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Initialize state
    for (let i = 0; i < schedule.stateSlots.length; i++) {
      state.state[i] = schedule.stateSlots[i].initialValue;
    }

    executeFrame(program, state, pool, 100);
    expect(state.state[0]).toBeCloseTo(0.5, 5); // No movement
  });

  it('respects custom initial phase', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const freqBlock = b.addBlock('Const', { value: 1 });
      const phasorBlock = b.addBlock('Phasor', { initialPhase: 0.75 });
      b.wire(freqBlock, 'out', phasorBlock, 'frequency');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const schedule = result.program.schedule as any;
    expect(schedule.stateSlots[0].initialValue).toBe(0.75);
  });
});
```

### Key test patterns to follow
- Use `buildPatch` + `compile` + `executeFrame` pattern (same as UnitDelay tests)
- Always add `InfiniteTimeRoot` block (required for compilation)
- Access state via `state.state[0]` (state slot index)
- Use `toBeCloseTo` for floating point comparisons
- Initialize custom state values from `schedule.stateSlots[i].initialValue`

---

## Critical: isStateful Flag

The `isStateful: true` field MUST be set on both new block registrations. This is what the SCC pass (`pass5-scc.ts:115`) checks to determine if a cycle through the block is legal.

Current state: Neither UnitDelay nor SampleHold set this field. The new blocks SHOULD set it. Whether to also add it to UnitDelay/SampleHold is outside this sprint's scope but would be a good followup.

---

## sigMap vs sigZip Usage

- `sigZip([a, b], fn, type)` — binary/ternary operations (Add, Mul, Lerp)
- `sigMap(input, fn, type)` — unary operations (Wrap01, Neg, Abs)

Phasor uses BOTH:
- `sigZip` for Mul (frequency * dtSec), Add (prev + increment)
- `sigMap` for Wrap01 (unary wrap of accumulated phase)

Lag uses:
- `sigZip` for Lerp (ternary: prev, target, smoothing)

---

## Existing Patterns to Follow

### State management (from UnitDelay, lines 257-269)
```typescript
const stateSlot = ctx.b.allocStateSlot(
  stableStateId(ctx.instanceId, 'delay'),  // Change to 'lag' or 'phasor'
  { initialValue }
);
const prevId = ctx.b.sigStateRead(stateSlot, signalType('float'));
// ... compute ...
ctx.b.stepStateWrite(stateSlot, valueToStore);
```

### Config access (from UnitDelay, line 255)
```typescript
const initialValue = (config?.initialValue as number) ?? 0;
```

### Input validation (from UnitDelay, lines 250-253)
```typescript
const input = inputsById.in;
if (!input || input.k !== 'sig') {
  throw new Error('...');
}
```

### Slot allocation (from UnitDelay, line 271)
```typescript
const slot = ctx.b.allocSlot();
```
