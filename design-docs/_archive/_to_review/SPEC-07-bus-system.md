# Spec: Bus System Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Bus System
**Priority:** Tier 0

---

## Overview

The bus system has critical gaps: bus evaluation steps aren't emitted in the schedule, event buses don't work, and bus combination modes are incomplete.

---

## Backlog Checklist

- [ ] Emit bus evaluation steps in schedule and thread bus roots/listeners.
- [ ] Implement event bus combination + listener edge detection.
- [ ] Extend bus combination to non-numeric domains (vec2/vec3/color).
- [ ] Implement field-typed bus evaluation and combine.
- [ ] Add bus publisher ordering/priority support.

---

## Gap 1: Bus Evaluation Never Runs (CRITICAL)

### Current State

**Location:** `src/editor/compiler/ir/buildSchedule.ts:14`

```typescript
// KNOWN GAPS:
// - StepBusEval is NOT emitted (busRoots from pass7 not threaded through BuilderProgramIR)
```

### Impact

- Bus values are never computed
- Bus listeners receive nothing
- Entire bus system non-functional in IR mode

### Proposed Solution

```typescript
// In BuilderProgramIR, add bus info from pass7
interface BuilderProgramIR {
  // ... existing fields
  busRoots: BusRootInfo[];  // From pass7
  busListeners: BusListenerInfo[];
}

interface BusRootInfo {
  busId: string;
  type: TypeDesc;
  combineMode: CombineMode;
  publisherSlots: ValueSlot[];  // Slots that publish to this bus
  outputSlot: ValueSlot;        // Slot to write combined value
}

// In buildSchedule.ts, emit StepBusEval
function buildSchedule(builderIR: BuilderProgramIR): ScheduleIR {
  const steps: StepIR[] = [];

  // 1. Time derivation (existing)
  steps.push(buildTimeStep(builderIR));

  // 2. Bus evaluation - NEW
  for (const bus of builderIR.busRoots) {
    steps.push({
      kind: "busEval",
      busId: bus.busId,
      publisherSlots: bus.publisherSlots,
      outputSlot: bus.outputSlot,
      combineMode: bus.combineMode,
      type: bus.type,
    } satisfies StepBusEval);
  }

  // 3. Signal evaluation
  steps.push(buildSignalStep(builderIR));

  // ... rest of schedule
}

// Ensure pass7 output is threaded through
// src/editor/compiler/passes/pass7-bus-resolution.ts
export function pass7BusResolution(input: Pass6Output): Pass7Output {
  const busRoots = analyzeBusTopology(input.buses);
  const busListeners = findBusListeners(input.graph);

  return {
    ...input,
    busRoots,
    busListeners,
  };
}
```

### Files to Modify

1. `src/editor/compiler/ir/builderTypes.ts` - Add busRoots to BuilderProgramIR
2. `src/editor/compiler/ir/buildSchedule.ts` - Emit StepBusEval
3. `src/editor/compiler/passes/pass7-bus-resolution.ts` - Thread busRoots
4. `src/editor/compiler/passes/pass6-block-lowering.ts` - Populate busRoots

### Complexity

Medium-High - Requires threading bus info through multiple passes.

---

## Gap 2: Event Buses Not Supported (HIGH)

### Current State

**Location:** `src/editor/runtime/executor/steps/executeEventBusEval.ts`

Event buses exist but:
- No event combination semantics
- No edge detection for listeners
- Event timing not coordinated

### Impact

- Event-driven animations don't work
- Trigger propagation fails

### Proposed Solution

```typescript
// Event bus types
interface EventBusIR {
  busId: string;
  type: TypeDesc;  // world: "event"
  triggerMode: "any" | "all" | "first";  // How to combine triggers
}

interface StepEventBusEval {
  kind: "eventBusEval";
  busId: string;
  publisherSlots: number[];  // Event source slots
  outputSlot: number;        // Combined event output
  triggerMode: "any" | "all" | "first";
}

// Event bus evaluation
function executeEventBusEval(
  step: StepEventBusEval,
  runtime: RuntimeState
): void {
  const triggers = step.publisherSlots.map(slot =>
    runtime.events.check(slot)
  );

  let combined: boolean;
  switch (step.triggerMode) {
    case "any":
      combined = triggers.some(t => t);
      break;
    case "all":
      combined = triggers.every(t => t);
      break;
    case "first":
      combined = triggers[0] ?? false;
      break;
  }

  if (combined) {
    runtime.events.trigger(step.outputSlot);
  }
}

// Event listeners need edge detection
interface EventListenerState {
  prevValue: boolean;
}

function checkEventEdge(
  slot: number,
  runtime: RuntimeState,
  state: EventListenerState
): { rising: boolean; falling: boolean } {
  const current = runtime.events.check(slot);
  const rising = current && !state.prevValue;
  const falling = !current && state.prevValue;
  state.prevValue = current;
  return { rising, falling };
}
```

### Complexity

Medium - Event semantics need careful design.

---

## Gap 3: Bus Combination Modes Incomplete (MEDIUM)

### Current State

**Location:** `src/editor/runtime/executor/steps/executeBusEval.ts:152-176`

```typescript
function combineValues(values: number[], mode: CombineMode): number {
  switch (mode) {
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "max": return Math.max(...values);
    case "min": return Math.min(...values);
    case "average": return values.reduce((a, b) => a + b, 0) / values.length;
    case "layer": return values[values.length - 1];  // Last wins
    default:
      throw new Error(`Unknown combine mode: ${mode}`);
  }
}
```

Only supports numeric buses.

### Impact

- Vec2/vec3 buses can't combine
- Color buses can't combine
- Field buses not handled

### Proposed Solution

```typescript
type CombineMode =
  | "sum" | "max" | "min" | "average" | "layer"  // Existing
  | "blend" | "multiply";  // New for colors

function combineValues(
  values: unknown[],
  mode: CombineMode,
  type: TypeDesc
): unknown {
  switch (type.domain) {
    case "number":
    case "phase01":
    case "time":
      return combineNumbers(values as number[], mode);

    case "vec2":
      return combineVec2s(values as Vec2[], mode);

    case "vec3":
      return combineVec3s(values as Vec3[], mode);

    case "color":
      return combineColors(values as Color[], mode);

    default:
      throw new Error(`Unsupported domain for combine: ${type.domain}`);
  }
}

function combineVec2s(values: Vec2[], mode: CombineMode): Vec2 {
  switch (mode) {
    case "sum":
      return values.reduce(
        (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
        { x: 0, y: 0 }
      );
    case "average":
      const sum = combineVec2s(values, "sum");
      return { x: sum.x / values.length, y: sum.y / values.length };
    case "layer":
      return values[values.length - 1];
    default:
      throw new Error(`Unsupported mode ${mode} for vec2`);
  }
}

function combineColors(values: Color[], mode: CombineMode): Color {
  switch (mode) {
    case "layer":
      return alphaComposite(values);  // Alpha blending
    case "blend":
      return averageColors(values);
    case "multiply":
      return multiplyColors(values);
    case "sum":
      return addColors(values);  // Additive (clamped)
    default:
      throw new Error(`Unsupported mode ${mode} for color`);
  }
}

function alphaComposite(colors: Color[]): Color {
  let result = { r: 0, g: 0, b: 0, a: 0 };
  for (const c of colors) {
    const alpha = c.a / 255;
    const invAlpha = 1 - alpha;
    result = {
      r: c.r * alpha + result.r * invAlpha,
      g: c.g * alpha + result.g * invAlpha,
      b: c.b * alpha + result.b * invAlpha,
      a: c.a + result.a * invAlpha,
    };
  }
  return result;
}
```

### Complexity

Medium - Pattern is clear, just domain-specific logic.

---

## Gap 4: Field Buses Not Implemented (MEDIUM)

### Current State

Field-typed buses (per-element values) don't combine properly.

### Impact

- Can't merge field producers
- Multi-source fields broken

### Proposed Solution

```typescript
// Field bus combines element-wise
function combineFieldBus(
  publishers: FieldHandle[],
  mode: CombineMode,
  domainCount: number,
  env: FieldEnv
): Float32Array {
  // Materialize all publishers
  const buffers = publishers.map(p => materializeField(p, env));

  // Combine element-wise
  const result = new Float32Array(domainCount);
  for (let i = 0; i < domainCount; i++) {
    const values = buffers.map(b => b[i]);
    result[i] = combineNumbers(values, mode);
  }

  return result;
}

// StepBusEval for fields
interface StepFieldBusEval {
  kind: "fieldBusEval";
  busId: string;
  publisherHandles: FieldExprId[];
  outputSlot: ValueSlot;
  combineMode: CombineMode;
  domainSlot: ValueSlot;  // For domain count
}

function executeFieldBusEval(
  step: StepFieldBusEval,
  runtime: RuntimeState,
  fieldEnv: FieldEnv
): void {
  const domainHandle = runtime.values.read(step.domainSlot);
  const count = (domainHandle as DomainHandle).count;

  const combined = combineFieldBus(
    step.publisherHandles.map(h => buildFieldHandle(h, fieldEnv)),
    step.combineMode,
    count,
    fieldEnv
  );

  runtime.values.write(step.outputSlot, combined);
}
```

### Complexity

Medium - Extends existing pattern to fields.

---

## Gap 5: Bus Ordering and Priority (LOW)

### Current State

No ordering between bus publishers.

### Impact

- "layer" mode order undefined
- Priority-based combination impossible

### Proposed Solution

```typescript
interface BusPublisher {
  slot: ValueSlot;
  priority: number;  // Lower = earlier
  enabled?: ValueSlot;  // Optional enable signal
}

interface BusRootInfo {
  busId: string;
  type: TypeDesc;
  combineMode: CombineMode;
  publishers: BusPublisher[];  // Ordered by priority
  outputSlot: ValueSlot;
}

// Sort publishers by priority during combination
function combineWithPriority(
  publishers: BusPublisher[],
  mode: CombineMode,
  runtime: RuntimeState
): unknown {
  // Filter enabled publishers
  const enabled = publishers.filter(p => {
    if (p.enabled === undefined) return true;
    return runtime.values.read(p.enabled) !== 0;
  });

  // Sort by priority
  enabled.sort((a, b) => a.priority - b.priority);

  // Read values and combine
  const values = enabled.map(p => runtime.values.read(p.slot));
  return combineValues(values, mode, type);
}
```

### Complexity

Low - Simple priority sorting.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| Bus eval not emitted | CRITICAL | Medium-High | Any bus functionality |
| Event buses | HIGH | Medium | Event-driven animations |
| Non-numeric combine | MEDIUM | Medium | vec2/color buses |
| Field buses | MEDIUM | Medium | Multi-source fields |
| Bus ordering | LOW | Low | Predictable combination |

**Recommended order:** Bus eval emission → Non-numeric combine → Event buses → Field buses → Ordering
