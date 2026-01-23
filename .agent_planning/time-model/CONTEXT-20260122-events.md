# Implementation Context: Event System

**Generated:** 2026-01-22
**Topic:** time-model / events
**Spec:** `design-docs/_new/10-Events-1.md`

This document provides all context needed to implement the event system.

---

## Concepts

### What is an Event?

An event is a value with `temporality = discrete`. It is meaningful only at a frame boundary (tick). It is true for exactly one tick when it fires, otherwise false. There is no interpolation between ticks.

### Events vs Signals

| | Signal | Event |
|---|--------|-------|
| Storage | `Float64Array` (ValueSlot) | `Uint8Array` (EventSlotId) |
| Type | Any payload | Always `bool` |
| Temporality | continuous | discrete |
| Lifetime | Persists until overwritten | Cleared every tick |
| Interpolation | Yes (between ticks) | No |

### pulse(timeRoot)

The global tick pulse. Fires **every tick** unconditionally. This is NOT phase-wrap detection — it's a clock tick. Phase-wrap detection would be `wrap(phaseA)`.

---

## File Locations

### Files to Create

1. **`src/runtime/EventEvaluator.ts`** — Event expression evaluator
2. **`src/runtime/__tests__/EventEvaluator.test.ts`** — Event evaluator tests

### Files to Modify

1. **`src/compiler/ir/Indices.ts`** (~145 lines)
   - Add `EventSlotId` branded type + factory function
   - Pattern: same as `ValueSlot`, `StateSlotId`

2. **`src/compiler/ir/program.ts`** (~272 lines)
   - Add `EventSlotMetaEntry` interface
   - Add `eventSlotMeta` to `CompiledProgramIR`

3. **`src/compiler/ir/types.ts`** (~497 lines)
   - Add `StepEvalEvent` interface
   - Add to `Step` union type
   - Export `StepEvalEvent` in the imports/exports

4. **`src/compiler/ir/IRBuilder.ts`** (~378 lines)
   - Change `registerEventSlot` → `allocEventSlot` signature
   - Return `EventSlotId` instead of void

5. **`src/compiler/ir/IRBuilderImpl.ts`** (~660 lines)
   - Replace `eventSlots: Map<EventExprId, ValueSlot>` → `Map<EventExprId, EventSlotId>`
   - Add `eventSlotCounter: number`
   - Implement `allocEventSlot(eventId): EventSlotId`
   - Add `getEventSlotCount(): number`

6. **`src/compiler/ir/lowerTypes.ts`** (~35 lines)
   - Change `ValueRefPacked` event variant: `slot: ValueSlot` → `slot: EventSlotId`

7. **`src/compiler/passes-v2/pass7-schedule.ts`** (~490 lines)
   - Read event slots from builder
   - Emit `StepEvalEvent` steps in phase 6 position
   - Add `eventSlotCount` to `ScheduleIR`

8. **`src/compiler/compile.ts`** (~520 lines)
   - Include `eventSlotMeta` in `CompiledProgramIR` output
   - Pass event slot count through

9. **`src/runtime/RuntimeState.ts`** (~575 lines)
   - Add `eventScalars: Uint8Array` to `ProgramState` and `RuntimeState`
   - Add `eventPrevPredicate: Uint8Array` to `ProgramState` and `RuntimeState`
   - Update `createProgramState()` to accept `eventSlotCount`

10. **`src/runtime/ScheduleExecutor.ts`** (~490 lines)
    - Add per-frame clearing: `state.eventScalars.fill(0)`
    - Add `case 'evalEvent'` dispatch

11. **`src/blocks/time-blocks.ts`** (~65 lines)
    - Use `allocEventSlot(pulse)` instead of `allocSlot()`
    - Emit pulse in `outputsById` with `k: 'event'`
    - Remove `void pulse` hack

12. **`src/compiler/passes-v2/pass6-block-lowering.ts`** (~400+ lines)
    - Update output validation to accept `k: 'event'` outputs

---

## Key Interfaces (Current State)

### EventExpr (already exists, correct)

```typescript
// src/compiler/ir/types.ts
export type EventExpr =
  | { kind: 'const'; fired: boolean }
  | { kind: 'pulse'; source: 'timeRoot' }
  | { kind: 'wrap'; signal: SigExprId }
  | { kind: 'combine'; events: readonly EventExprId[]; mode: 'any' | 'all' }
  | { kind: 'never' };
```

### Step (needs StepEvalEvent added)

```typescript
export type Step =
  | StepEvalSig
  | StepMaterialize
  | StepRender
  | StepStateWrite
  | StepFieldStateWrite
  | StepContinuityMapBuild
  | StepContinuityApply
  | StepEvalEvent;  // NEW
```

### Execution Order

```
1. Clear eventScalars to 0
2. Advance frame (cache.frameId++)
3. Resolve time
4. evalSig steps (signals)
5. continuityMapBuild steps
6. materialize steps (fields)
7. continuityApply steps
8. evalEvent steps (events) ← NEW, phase 6
9. render steps (sinks)
10. stateWrite steps (state persistence)
```

---

## Spec Rules (Key Constraints)

1. Events MUST NOT use ValueSlot storage (§11.4)
2. Event storage cleared to 0 at start of every tick (§6.1)
3. Multiple writes to same event slot are monotone OR (§8.1)
4. `pulse(timeRoot)` fires every tick (§8.4)
5. `wrap(signal)` is rising edge of `value >= 0.5` (§8.6.1)
6. `wrap` NaN/Inf → treat as false (§8.6.3)
7. On recompile: all event storage and prevPredicate cleared (§12)
8. No implicit coercion between events and signals (§3.2, §9)
9. HistoryService must reject discrete temporality (§10.2)

---

## Existing Event Infrastructure (what's already built)

| Component | Status | Notes |
|-----------|--------|-------|
| `EventExpr` type | ✅ Complete | All 5 variants defined |
| `EventExprId` branded type | ✅ Complete | In Indices.ts |
| `eventPulse()` builder method | ✅ Complete | Returns EventExprId |
| `eventWrap()` builder method | ✅ Complete | Takes SigExprId |
| `eventCombine()` builder method | ✅ Complete | Takes EventExprId[] |
| `eventNever()` builder method | ✅ Complete | Returns EventExprId |
| `EventExprTable` in program | ✅ Complete | readonly nodes: EventExpr[] |
| `registerEventSlot()` | ❌ Wrong type | Uses ValueSlot, must use EventSlotId |
| `EventSlotId` type | ❌ Missing | Needs to be created |
| `EventSlotMetaEntry` | ❌ Missing | Needs to be created |
| `StepEvalEvent` | ❌ Missing | Needs to be created |
| Event evaluator | ❌ Missing | Needs to be created |
| `eventScalars` storage | ❌ Missing | Needs Uint8Array in RuntimeState |
| `eventPrevPredicate` | ❌ Missing | Needs Uint8Array in RuntimeState |
| Per-frame clearing | ❌ Missing | Needs in ScheduleExecutor |
