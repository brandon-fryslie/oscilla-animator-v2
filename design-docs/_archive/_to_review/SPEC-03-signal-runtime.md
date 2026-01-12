# Spec: Signal Runtime Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Signal Runtime
**Priority:** Tier 1

---

## Overview

Signal runtime has gaps in stateful operation evaluation, time handling, and non-numeric signal paths.

---

## Backlog Checklist

- [ ] Implement stateful signal evaluators (delayFrames, pulseDivider, envelopeAD, integrate).
- [ ] Wire state allocation/buffer layout for stateful ops.
- [ ] Fix time derivation (tAbsMs write, delta-based wrap detection).
- [ ] Support non-numeric signal slots (vec2/vec3/color) in eval + allocation.
- [ ] Treat wrap event as discrete trigger (event store integration).
- [ ] Add ColorHSLToRGB kernel and ColorLFO IR lowering path.

---

## Gap 1: Stateful Signal Evaluators (CRITICAL)

### Current State

**Location:** `src/editor/runtime/signal-expr/SigEvaluator.ts`

Stateful operations are declared in IR but have incomplete/missing runtime evaluators:
- `delayFrames` - No evaluator
- `pulseDivider` - No evaluator
- `envelopeAD` - No evaluator
- `integrate` - Partial implementation

### Impact

- `PulseDivider` block doesn't work in IR mode
- `EnvelopeAD` block doesn't work in IR mode
- Delay effects don't work

### Proposed Solution: State Binding System

```typescript
// In SigEvaluator.ts

interface StatefulEvalContext {
  stateBuffer: StateBuffer;
  frameId: number;
  deltaMs: number;
}

// Stateful evaluator dispatch
function evalStatefulOp(
  node: SignalExprStateful,
  env: SigEnv,
  stateCtx: StatefulEvalContext
): number {
  switch (node.op) {
    case 'integrate':
      return evalIntegrate(node, env, stateCtx);
    case 'delayFrames':
      return evalDelayFrames(node, env, stateCtx);
    case 'pulseDivider':
      return evalPulseDivider(node, env, stateCtx);
    case 'envelopeAD':
      return evalEnvelopeAD(node, env, stateCtx);
    default:
      throw new Error(`Unknown stateful op: ${node.op}`);
  }
}

// Integrate: accumulate input over time
function evalIntegrate(
  node: SignalExprStateful,
  env: SigEnv,
  stateCtx: StatefulEvalContext
): number {
  const input = evalSig(node.input, env);
  const stateId = node.stateId;

  // Read current accumulated value
  const current = stateCtx.stateBuffer.read(stateId);

  // Accumulate: new = current + input * dt
  const dt = stateCtx.deltaMs / 1000;
  const next = current + input * dt;

  // Write back
  stateCtx.stateBuffer.write(stateId, next);

  return next;
}

// DelayFrames: ring buffer of past values
function evalDelayFrames(
  node: SignalExprStateful,
  env: SigEnv,
  stateCtx: StatefulEvalContext
): number {
  const input = evalSig(node.input, env);
  const frames = node.params?.frames ?? 1;
  const stateId = node.stateId;

  // State layout: [writeIndex, value0, value1, ..., valueN-1]
  const writeIndex = Math.floor(stateCtx.stateBuffer.read(stateId)) % frames;
  const readIndex = (writeIndex + 1) % frames;

  // Read delayed value
  const delayed = stateCtx.stateBuffer.read(stateId + 1 + readIndex);

  // Write current value
  stateCtx.stateBuffer.write(stateId + 1 + writeIndex, input);

  // Update write index
  stateCtx.stateBuffer.write(stateId, writeIndex + 1);

  return delayed;
}

// PulseDivider: emit 1 every N pulses
function evalPulseDivider(
  node: SignalExprStateful,
  env: SigEnv,
  stateCtx: StatefulEvalContext
): number {
  const trigger = evalSig(node.input, env);
  const divisor = node.params?.divisor ?? 2;
  const stateId = node.stateId;

  // State: [prevTrigger, count]
  const prevTrigger = stateCtx.stateBuffer.read(stateId);
  const count = stateCtx.stateBuffer.read(stateId + 1);

  // Detect rising edge
  const isRising = trigger > 0.5 && prevTrigger <= 0.5;

  // Update state
  stateCtx.stateBuffer.write(stateId, trigger);

  if (isRising) {
    const newCount = count + 1;
    stateCtx.stateBuffer.write(stateId + 1, newCount);

    // Emit pulse every divisor triggers
    return (newCount % divisor === 0) ? 1 : 0;
  }

  return 0;
}

// EnvelopeAD: attack-decay envelope generator
function evalEnvelopeAD(
  node: SignalExprStateful,
  env: SigEnv,
  stateCtx: StatefulEvalContext
): number {
  const trigger = evalSig(node.input, env);
  const attackMs = node.params?.attackMs ?? 100;
  const decayMs = node.params?.decayMs ?? 200;
  const stateId = node.stateId;

  // State: [phase, level, triggerTime]
  // phase: 0 = idle, 1 = attack, 2 = decay
  const phase = stateCtx.stateBuffer.read(stateId);
  const level = stateCtx.stateBuffer.read(stateId + 1);
  const triggerTime = stateCtx.stateBuffer.read(stateId + 2);

  const now = env.tMs;
  const dt = stateCtx.deltaMs;

  // Detect trigger
  if (trigger > 0.5 && phase === 0) {
    stateCtx.stateBuffer.write(stateId, 1);  // Attack phase
    stateCtx.stateBuffer.write(stateId + 2, now);
    return 0;
  }

  if (phase === 1) {
    // Attack phase
    const elapsed = now - triggerTime;
    const newLevel = Math.min(1, elapsed / attackMs);
    stateCtx.stateBuffer.write(stateId + 1, newLevel);

    if (newLevel >= 1) {
      stateCtx.stateBuffer.write(stateId, 2);  // Decay phase
      stateCtx.stateBuffer.write(stateId + 2, now);
    }
    return newLevel;
  }

  if (phase === 2) {
    // Decay phase
    const elapsed = now - triggerTime;
    const newLevel = Math.max(0, 1 - elapsed / decayMs);
    stateCtx.stateBuffer.write(stateId + 1, newLevel);

    if (newLevel <= 0) {
      stateCtx.stateBuffer.write(stateId, 0);  // Idle
    }
    return newLevel;
  }

  return level;
}
```

### State Allocation in Compiler

```typescript
// In IRBuilderImpl.ts
allocStateId(type: TypeDesc, slots: number, label?: string): StateId {
  const id = this.nextStateId;
  this.nextStateId += slots;
  this.stateLayout.push({
    id,
    slots,
    type,
    label,
    initialValue: 0,
  });
  return id as StateId;
}
```

### Complexity

High - Each stateful op needs careful implementation and state management.

---

## Gap 2: Time Signal Handling (HIGH)

### Current State

**Location:** `src/editor/runtime/executor/steps/executeTimeDerive.ts:33`

```typescript
// tAbsMs slot is declared but never written
// wrapEvent uses fixed 16.67ms delta
```

### Impact

- Absolute time not available in IR mode
- Variable frame rate causes wrap detection jitter

### Proposed Solution

```typescript
// In executeTimeDerive.ts
function executeTimeDerive(
  step: StepTimeDerive,
  state: RuntimeState,
  tMs: number
): void {
  const prevTMs = state.prevFrameTimeMs ?? tMs;
  const deltaMs = tMs - prevTMs;

  // Write all time slots
  state.valueStore.write(step.tAbsMsSlot, tMs);
  state.valueStore.write(step.tModelMsSlot, computeModelTime(tMs, step.timeModel));
  state.valueStore.write(step.phase01Slot, computePhase(tMs, step.timeModel));

  // Wrap detection with actual delta
  if (step.wrapEventSlot !== undefined) {
    const wrap = detectWrap(tMs, prevTMs, step.timeModel);
    state.valueStore.write(step.wrapEventSlot, wrap ? 1 : 0);
  }

  // Store for next frame
  state.prevFrameTimeMs = tMs;
}

function detectWrap(tMs: number, prevTMs: number, timeModel: TimeModelIR): boolean {
  if (timeModel.kind !== 'cyclic') return false;

  const period = timeModel.periodMs;
  const prevPhase = (prevTMs % period) / period;
  const currPhase = (tMs % period) / period;

  // Wrap if phase went backwards (crossed period boundary)
  return currPhase < prevPhase;
}
```

### Complexity

Medium - Clear logic, just needs proper wiring.

---

## Gap 3: Non-Numeric Signal Paths (MEDIUM)

### Current State

**Location:** `src/editor/runtime/signal-expr/SigEvaluator.ts:300`

```typescript
case 'inputSlot':
  return state.valueStore.read(node.slot);  // Assumes number
```

### Impact

- Vec2/vec3 signals not supported through input slots
- Color signals can't flow through IR

### Proposed Solution

```typescript
// Type-aware signal evaluation
function evalSig(
  node: SignalExprIR,
  env: SigEnv
): number | Vec2 | Vec3 | Color {
  switch (node.kind) {
    case 'inputSlot':
      return evalInputSlot(node, env);
    // ... other cases
  }
}

function evalInputSlot(
  node: SignalExprInputSlot,
  env: SigEnv
): number | Vec2 | Vec3 | Color {
  const slot = node.slot;
  const type = env.slotMeta[slot].type;

  switch (type.domain) {
    case 'number':
    case 'phase01':
    case 'time':
      return env.valueStore.read(slot);

    case 'vec2':
      return {
        x: env.valueStore.read(slot),
        y: env.valueStore.read(slot + 1),
      };

    case 'vec3':
      return {
        x: env.valueStore.read(slot),
        y: env.valueStore.read(slot + 1),
        z: env.valueStore.read(slot + 2),
      };

    case 'color':
      return {
        r: env.valueStore.read(slot),
        g: env.valueStore.read(slot + 1),
        b: env.valueStore.read(slot + 2),
        a: env.valueStore.read(slot + 3),
      };

    default:
      throw new Error(`Unsupported signal domain: ${type.domain}`);
  }
}

// Slot allocation must account for multi-slot types
function allocValueSlot(type: TypeDesc): ValueSlot {
  const slots = getSlotCount(type);
  const slot = this.nextSlot;
  this.nextSlot += slots;
  return slot as ValueSlot;
}

function getSlotCount(type: TypeDesc): number {
  switch (type.domain) {
    case 'number':
    case 'phase01':
    case 'time':
    case 'boolean':
      return 1;
    case 'vec2':
      return 2;
    case 'vec3':
      return 3;
    case 'color':
      return 4;
    default:
      return 1;
  }
}
```

### Complexity

Medium - Systematic change across slot allocation and evaluation.

---

## Gap 4: Wrap Event as Discrete Trigger (MEDIUM)

### Current State

`wrapEvent` is evaluated as a numeric signal, not a discrete trigger.

### Impact

- Event semantics (edge-triggered, sparse) not enforced
- Continuous consumers get wrong values

### Proposed Solution

```typescript
// Event values are discrete: either triggered or not
type EventValue = { triggered: boolean; payload?: unknown };

// In time derivation
if (step.wrapEventSlot !== undefined) {
  const wrap = detectWrap(tMs, prevTMs, step.timeModel);
  // Store as event, not number
  state.eventStore.set(step.wrapEventSlot, {
    triggered: wrap,
    payload: { phase: currPhase, period: timeModel.periodMs },
  });
}

// Event consumers read from eventStore, not valueStore
function evalWrapEvent(node: SignalExprWrapEvent, env: SigEnv): number {
  const event = env.eventStore.get(node.slot);
  // Convert to number for signal compatibility (1 if triggered this frame)
  return event?.triggered ? 1 : 0;
}
```

### Complexity

Medium - Requires separating event store from value store.

---

## Gap 5: ColorHSLToRGB Kernel (HIGH)

### Current State

**Location:** `src/editor/compiler/blocks/signal/ColorLFO.ts:130`

```typescript
throw new Error('ColorLFO cannot be lowered to IR: requires ColorHSLToRGB kernel');
```

### Impact

- ColorLFO block can't run in IR mode
- Any HSL-based color animation fails

### Proposed Solution

```typescript
// Add HSL-to-RGB kernel
const KERNELS = {
  ColorHSLToRGB: (h: number, s: number, l: number): [number, number, number, number] => {
    // H is 0-360, S and L are 0-100
    const hue = ((h % 360) + 360) % 360;
    const sat = Math.max(0, Math.min(100, s)) / 100;
    const lit = Math.max(0, Math.min(100, l)) / 100;

    const c = (1 - Math.abs(2 * lit - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lit - c / 2;

    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
      255,  // Alpha
    ];
  },
};

// Add signal expression for color
interface SignalExprColor {
  kind: 'color';
  type: TypeDesc;  // { world: 'signal', domain: 'color' }
  h: SigExprId;
  s: SigExprId;
  l: SigExprId;
  a?: SigExprId;
}

// Evaluator
case 'color': {
  const h = evalSig(node.h, env);
  const s = evalSig(node.s, env);
  const l = evalSig(node.l, env);
  const a = node.a ? evalSig(node.a, env) : 1;
  const [r, g, b] = KERNELS.ColorHSLToRGB(h, s, l);
  return { r: r/255, g: g/255, b: b/255, a };
}
```

### Complexity

Low-Medium - Standard color math, just needs wiring.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| Stateful evaluators | CRITICAL | High | PulseDivider, EnvelopeAD, delays |
| Time signal handling | HIGH | Medium | Proper time flow |
| ColorHSLToRGB | HIGH | Low-Medium | Color animations |
| Non-numeric signals | MEDIUM | Medium | Vec2/color signal flow |
| Wrap event semantics | MEDIUM | Medium | Clean event system |

**Recommended order:** Time handling → ColorHSLToRGB → Stateful evaluators → Non-numeric → Events
