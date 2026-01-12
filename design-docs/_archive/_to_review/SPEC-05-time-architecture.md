# Spec: Time Architecture Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Time Architecture
**Priority:** Tier 0

---

## Overview

Time handling has critical gaps: TimeModel is hardcoded to infinite, wrap detection uses fixed delta, and TimeRoot block isn't respected.

---

## Backlog Checklist

- [ ] Extract TimeModel from TimeRoot in compiler passes and thread into IRBuilder.
- [ ] Use real frame deltas for wrap detection and time derivation.
- [ ] Align PhaseClock semantics with TimeRoot (phase ref + adjust kernel).
- [ ] Add discrete event store for wrap/pulse events.
- [ ] Add scrub/seek handling to suppress wrap and reset stateful ops.

---

## Gap 1: TimeModel Hardcoded to Infinite (CRITICAL)

### Current State

**Location:** `src/editor/compiler/ir/IRBuilderImpl.ts` (inferred from pass behavior)

```typescript
// TimeModel is always { kind: 'infinite' }
// Cyclic time from TimeRoot block is ignored
```

### Impact

- Cyclic animations don't loop
- Phase calculations are wrong
- TimeRoot block configuration ignored

### Proposed Solution

```typescript
// TimeModel types
type TimeModelIR =
  | { kind: "infinite" }
  | { kind: "cyclic"; periodMs: number; offset: number }
  | { kind: "finite"; durationMs: number; fillMode: "hold" | "extend" };

// Pass 3 must extract TimeRoot configuration
interface Pass3Output {
  timeRoots: TimeRootInfo[];
  selectedTimeModel: TimeModelIR;
}

function extractTimeModel(patch: Patch): TimeModelIR {
  const timeRoots = findBlocksByType(patch, "TimeRoot");

  // Validate exactly one TimeRoot
  if (timeRoots.length === 0) {
    // Default to infinite
    return { kind: "infinite" };
  }
  if (timeRoots.length > 1) {
    throw new CompileError("Multiple TimeRoot blocks found - exactly one required");
  }

  const config = timeRoots[0].config;
  switch (config.mode) {
    case "infinite":
      return { kind: "infinite" };

    case "cyclic":
      return {
        kind: "cyclic",
        periodMs: config.periodMs,
        offset: config.offsetMs ?? 0,
      };

    case "finite":
      return {
        kind: "finite",
        durationMs: config.durationMs,
        fillMode: config.fillMode ?? "hold",
      };
  }
}

// Thread through to IRBuilder
interface IRBuilderOptions {
  timeModel: TimeModelIR;
  // ... other options
}
```

### Files to Modify

1. `src/editor/compiler/passes/pass3-time-resolution.ts` - Extract TimeRoot config
2. `src/editor/compiler/ir/IRBuilderImpl.ts` - Accept TimeModel
3. `src/editor/compiler/passes/pass6-block-lowering.ts` - Thread through

### Complexity

Medium - Clear data flow, just needs wiring.

---

## Gap 2: Wrap Detection Uses Fixed Delta (HIGH)

### Current State

**Location:** `src/editor/runtime/executor/timeResolution.ts` (inferred)

```typescript
// Wrap detection uses hardcoded 16.67ms (60fps assumed)
const deltaMs = 16.67;
```

### Impact

- Variable frame rate causes wrap detection jitter
- Fast/slow playback has wrong wrap behavior
- Scrubbing breaks wrap detection

### Proposed Solution

```typescript
// Track actual frame delta
interface TimeResolutionState {
  prevFrameTimeMs: number;
  wrapCount: number;
}

function resolveTime(
  tAbsMs: number,
  timeModel: TimeModelIR,
  state: TimeResolutionState
): EffectiveTime {
  const deltaMs = tAbsMs - state.prevFrameTimeMs;
  state.prevFrameTimeMs = tAbsMs;

  switch (timeModel.kind) {
    case "infinite":
      return {
        tAbsMs,
        tModelMs: tAbsMs,
        phase01: undefined,
        wrapEvent: undefined,
        progress01: undefined,
      };

    case "cyclic": {
      const period = timeModel.periodMs;
      const offset = timeModel.offset;
      const adjusted = tAbsMs - offset;

      const tModelMs = ((adjusted % period) + period) % period;
      const phase01 = tModelMs / period;

      // Wrap detection: did we cross a period boundary?
      const prevPhase = ((state.prevFrameTimeMs - offset) % period + period) % period / period;
      const wrapEvent = phase01 < prevPhase && deltaMs > 0;

      if (wrapEvent) {
        state.wrapCount++;
      }

      return { tAbsMs, tModelMs, phase01, wrapEvent, progress01: undefined };
    }

    case "finite": {
      const duration = timeModel.durationMs;
      const raw = Math.max(0, tAbsMs);

      if (raw >= duration) {
        const tModelMs = timeModel.fillMode === "hold" ? duration : raw;
        return {
          tAbsMs,
          tModelMs,
          phase01: undefined,
          wrapEvent: undefined,
          progress01: 1,
        };
      }

      return {
        tAbsMs,
        tModelMs: raw,
        phase01: undefined,
        wrapEvent: undefined,
        progress01: raw / duration,
      };
    }
  }
}
```

### Complexity

Medium - State tracking needed across frames.

---

## Gap 3: Phase Signal Semantics (HIGH)

### Current State

**Location:** `src/editor/compiler/blocks/domain/PhaseClock.ts`

PhaseClock emits phase01 but:
- Doesn't respect TimeRoot's period
- Doesn't handle multiple phase clocks
- Wrap events aren't coordinated

### Impact

- PhaseClock out of sync with TimeRoot
- Multiple phase sources conflict

### Proposed Solution

```typescript
// Phase signals must reference TimeRoot
interface PhaseSignalIR {
  kind: "phaseRef";
  timeRootId: string;  // Which TimeRoot to derive from
  multiplier: number;  // Speed multiplier
  offset: number;      // Phase offset 0..1
}

// PhaseClock lowering
const lowerPhaseClock: BlockLowerFn = ({ ctx, config }) => {
  const timeModel = ctx.getTimeModel();

  if (timeModel.kind !== "cyclic") {
    throw new CompileError("PhaseClock requires cyclic TimeRoot");
  }

  const multiplier = config.multiplier ?? 1;
  const offset = config.offset ?? 0;

  // Reference TimeRoot's phase, apply multiplier and offset
  const basePhaseSlot = ctx.getTimeSlot("phase01");
  const adjustedPhase = ctx.b.sigMap(
    ctx.b.sigInputSlot(basePhaseSlot),
    { kind: "kernel", name: "phaseAdjust", params: { multiplier, offset } }
  );

  return { outputs: [{ k: "sig", id: adjustedPhase }] };
};

// Kernel for phase adjustment
function phaseAdjust(phase: number, multiplier: number, offset: number): number {
  return ((phase * multiplier + offset) % 1 + 1) % 1;
}
```

### Complexity

Medium - Requires coordination between TimeRoot and PhaseClock.

---

## Gap 4: Time-Driven Events (MEDIUM)

### Current State

Wrap events are numeric signals, not discrete events.

### Impact

- Event consumers get continuous values, not triggers
- Edge detection happens at wrong level

### Proposed Solution

```typescript
// Event signal type
interface EventSlotValue {
  triggered: boolean;
  payload?: {
    phase: number;
    count: number;
    deltaMs: number;
  };
}

// Separate event store from value store
interface RuntimeStores {
  values: ValueStore;      // Continuous signals
  events: EventStore;      // Discrete events
  state: StateBuffer;      // Stateful operation memory
}

// Event store
class EventStore {
  private events = new Map<number, EventSlotValue>();

  trigger(slot: number, payload?: EventSlotValue["payload"]): void {
    this.events.set(slot, { triggered: true, payload });
  }

  check(slot: number): boolean {
    return this.events.get(slot)?.triggered ?? false;
  }

  reset(): void {
    this.events.clear();
  }
}

// In time derivation
if (wrapDetected) {
  runtime.events.trigger(step.out.wrapEvent, {
    phase: phase01,
    count: state.wrapCount,
    deltaMs,
  });
}
```

### Complexity

Medium - Requires separating event storage from continuous signals.

---

## Gap 5: Scrub/Seek Time Handling (MEDIUM)

### Current State

No special handling for scrubbing (non-monotonic time).

### Impact

- Wrap events fire incorrectly when scrubbing
- Stateful operations break on seek
- Frame delta is wrong for scrub jumps

### Proposed Solution

```typescript
interface TimeInput {
  tAbsMs: number;
  mode: "playback" | "scrub";  // Distinguish playback from scrubbing
}

function resolveTime(input: TimeInput, timeModel: TimeModelIR, state: TimeResolutionState): EffectiveTime {
  const deltaMs = input.tAbsMs - state.prevFrameTimeMs;

  // Detect scrub (large jump or backwards)
  const isScrub = input.mode === "scrub" ||
                  Math.abs(deltaMs) > 1000 ||  // >1s jump
                  deltaMs < 0;                  // Backwards

  if (isScrub) {
    // Don't fire wrap events during scrub
    // Reset stateful operations
    return {
      ...computeTime(input.tAbsMs, timeModel),
      wrapEvent: false,  // Suppress wrap during scrub
      isScrub: true,
    };
  }

  // Normal playback
  return computeTimeWithWrap(input.tAbsMs, timeModel, state, deltaMs);
}

// Signal stateful ops that state is invalid
function notifyScrub(runtime: RuntimeState): void {
  runtime.state.invalidate();  // Mark all stateful state as needing reset
}
```

### Complexity

Low-Medium - Detect and handle scrub mode.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| TimeModel hardcoded | CRITICAL | Medium | Cyclic/finite time |
| Wrap detection delta | HIGH | Medium | Accurate wrap events |
| Phase signal semantics | HIGH | Medium | PhaseClock coordination |
| Time-driven events | MEDIUM | Medium | Clean event system |
| Scrub handling | MEDIUM | Low-Medium | Proper scrubbing |

**Recommended order:** TimeModel wiring → Wrap detection → Phase semantics → Scrub handling → Events
