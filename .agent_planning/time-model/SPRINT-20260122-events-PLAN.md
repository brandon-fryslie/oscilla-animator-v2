# Sprint: Event System Implementation

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Implement the event system per `design-docs/_new/10-Events-1.md`. Events are discrete boolean signals that fire for exactly one tick. This sprint delivers: EventSlotId type, EventSlotMetaEntry, eventScalars storage, StepEvalEvent execution, event evaluator (const/never/pulse/combine/wrap), per-frame clearing, and pulse(timeRoot) wired end-to-end through InfiniteTimeRoot.

## Current State

**Already exists:**
- `EventExpr` union type (const/pulse/wrap/combine/never) in `types.ts`
- `EventExprId` branded index type in `Indices.ts`
- `eventPulse()`, `eventWrap()`, `eventCombine()`, `eventNever()` on IRBuilder
- `EventExprTable` in `CompiledProgramIR`
- `registerEventSlot()` on IRBuilder (currently maps EventExprId → ValueSlot — wrong)
- Phase 6 slot in pass7 ordering comment ("Apply discrete ops (events)")
- Pass3-time now generates `eventPulse('timeRoot')` for pulse

**Gaps:**
1. No `EventSlotId` branded type (events wrongly use ValueSlot)
2. No `EventSlotMetaEntry` in compiled program
3. No `eventScalars` storage in RuntimeState
4. No `StepEvalEvent` step kind
5. No event evaluator function
6. No per-frame clearing of event storage
7. No `eventPrevPredicate` state for wrap edge detection
8. Pulse output in time-blocks.ts not properly wired (currently uses void + ValueSlot hack)
9. `ValueRefPacked` event variant uses ValueSlot (should use EventSlotId)

## Work Items

### W1: EventSlotId Type and Meta

**Files:**
- `src/compiler/ir/Indices.ts` — add `EventSlotId` branded type + factory
- `src/compiler/ir/program.ts` — add `EventSlotMetaEntry`, add `eventSlotMeta` to `CompiledProgramIR`

**Changes:**
```typescript
// Indices.ts
export type EventSlotId = number & { readonly __brand: 'EventSlotId' };
export function eventSlotId(n: number): EventSlotId { return n as EventSlotId; }

// program.ts
export interface EventSlotMetaEntry {
  readonly slot: EventSlotId;
  readonly cardinality: { kind: 'one' } | { kind: 'many'; instanceId: InstanceId };
  readonly storage: 'scalar' | 'perLane';
  readonly scalarOffset?: number;  // index into eventScalars (when storage='scalar')
  readonly instanceId?: InstanceId; // (when storage='perLane')
}

// Add to CompiledProgramIR:
readonly eventSlotMeta: readonly EventSlotMetaEntry[];
```

**Acceptance Criteria:**
- [ ] `EventSlotId` is a distinct branded type (not ValueSlot)
- [ ] `EventSlotMetaEntry` matches spec §5.1
- [ ] `CompiledProgramIR` has `eventSlotMeta` field
- [ ] TypeScript enforces EventSlotId ≠ ValueSlot at compile time

---

### W2: IRBuilder Event Slot Infrastructure

**Files:**
- `src/compiler/ir/IRBuilder.ts` — change `registerEventSlot` signature
- `src/compiler/ir/IRBuilderImpl.ts` — event slot counter, allocation, meta generation
- `src/compiler/ir/lowerTypes.ts` — change `ValueRefPacked` event variant

**Changes:**
- `registerEventSlot(eventId: EventExprId, slot: ValueSlot)` → `allocEventSlot(eventId: EventExprId): EventSlotId`
- New `private eventSlotCounter = 0` in IRBuilderImpl
- `allocEventSlot` increments counter, stores mapping
- `getEventSlotCount(): number` and `getEventSlots(): Map<EventExprId, EventSlotId>`
- `ValueRefPacked` event variant: `{ k: 'event'; id: EventExprId; slot: EventSlotId }`

**Acceptance Criteria:**
- [ ] `allocEventSlot` returns `EventSlotId` (not ValueSlot)
- [ ] Event slots have their own counter (independent of ValueSlot counter)
- [ ] `ValueRefPacked` event variant uses `EventSlotId`
- [ ] Old `registerEventSlot` removed

---

### W3: StepEvalEvent and Step Union

**Files:**
- `src/compiler/ir/types.ts` — add `StepEvalEvent` to Step union

**Changes:**
```typescript
export interface StepEvalEvent {
  readonly kind: 'evalEvent';
  readonly expr: EventExprId;
  readonly target: EventSlotId;
}

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

**Acceptance Criteria:**
- [ ] `StepEvalEvent` has `kind: 'evalEvent'`, `expr: EventExprId`, `target: EventSlotId`
- [ ] Step union includes StepEvalEvent
- [ ] No other step types reference EventSlotId

---

### W4: Pass 7 — Emit evalEvent Steps

**Files:**
- `src/compiler/passes-v2/pass7-schedule.ts` — emit evalEvent steps between continuityApply and render

**Changes:**
- Read event slots from `unlinkedIR.builder.getEventSlots()`
- For each `(eventId, eventSlotId)`, emit `{ kind: 'evalEvent', expr: eventId, target: eventSlotId }`
- Insert evalEvent steps in phase 6 position (after continuityApply, before render)

**Acceptance Criteria:**
- [ ] evalEvent steps emitted for all registered event slots
- [ ] Execution order: evalSig → continuityMapBuild → materialize → continuityApply → **evalEvent** → render → stateWrite
- [ ] EventSlotMetaEntry array built and included in ScheduleIR (or passed through to CompiledProgramIR)

---

### W5: Event Storage in RuntimeState

**Files:**
- `src/runtime/RuntimeState.ts` — add event storage to ProgramState/RuntimeState

**Changes:**
```typescript
// Add to ProgramState:
/** Event scalar storage (0=not fired, 1=fired this tick) */
eventScalars: Uint8Array;

/** Previous predicate values for wrap edge detection (per EventExprId) */
eventPrevPredicate: Uint8Array;
```

- Update `createProgramState()` to accept `eventSlotCount` and allocate `Uint8Array(eventSlotCount)`
- Update `createRuntimeState()` and `createRuntimeStateFromSession()` accordingly

**Acceptance Criteria:**
- [ ] `eventScalars` is `Uint8Array` (not Float64Array, not Map)
- [ ] `eventPrevPredicate` is `Uint8Array` (for wrap state, indexed by EventExprId)
- [ ] Both cleared to 0 on creation
- [ ] Both cleared on recompile (per spec §12)

---

### W6: Event Evaluator

**Files:**
- `src/runtime/EventEvaluator.ts` — new file, evaluates EventExpr to boolean

**Implementation:**
```typescript
export function evaluateEvent(
  exprId: EventExprId,
  eventExprs: readonly EventExpr[],
  state: RuntimeState,
  signals: readonly SigExpr[],
): boolean {
  const expr = eventExprs[exprId as number];
  switch (expr.kind) {
    case 'const': return expr.fired;
    case 'never': return false;
    case 'pulse': return true; // fires every tick per spec §8.4
    case 'combine': {
      if (expr.mode === 'any') {
        return expr.events.some(e => evaluateEvent(e, eventExprs, state, signals));
      } else { // 'all'
        return expr.events.every(e => evaluateEvent(e, eventExprs, state, signals));
      }
    }
    case 'wrap': {
      // Edge detection: rising edge of (signalValue >= 0.5)
      const signalValue = evaluateSignal(expr.signal, signals, state);
      const predicate = (Number.isFinite(signalValue) && signalValue >= 0.5) ? 1 : 0;
      const prevPredicate = state.eventPrevPredicate[exprId as number];
      state.eventPrevPredicate[exprId as number] = predicate;
      return predicate === 1 && prevPredicate === 0; // rising edge
    }
  }
}
```

**Acceptance Criteria:**
- [ ] `const(true)` → fires, `const(false)` → doesn't
- [ ] `never` → never fires
- [ ] `pulse(timeRoot)` → fires every tick
- [ ] `combine(any)` → OR semantics
- [ ] `combine(all)` → AND semantics
- [ ] `wrap(signal)` → rising edge of `value >= 0.5`
- [ ] `wrap` handles NaN/Inf as false (§8.6.3)
- [ ] `wrap` uses `eventPrevPredicate` for edge state
- [ ] `eventPrevPredicate` updated after each wrap evaluation

---

### W7: ScheduleExecutor — evalEvent Dispatch + Clearing

**Files:**
- `src/runtime/ScheduleExecutor.ts` — add evalEvent case, add per-frame clearing

**Changes:**
1. At start of `executeFrame()`, clear `state.eventScalars.fill(0)` (§6.1)
2. Add case in step dispatch:
```typescript
case 'evalEvent': {
  const fired = evaluateEvent(step.expr, program.eventExprs.nodes, state, signals);
  if (fired) {
    state.eventScalars[step.target as number] = 1; // monotone OR
  }
  break;
}
```

**Acceptance Criteria:**
- [ ] `eventScalars` cleared to 0 at start of every frame
- [ ] `evalEvent` step evaluates event and writes 1 if fired
- [ ] Multiple writes to same slot are monotone OR (any 1 stays 1)
- [ ] No event data stored in ValueSlot/f64 storage

---

### W8: Wire Pulse in time-blocks.ts

**Files:**
- `src/blocks/time-blocks.ts` — use `allocEventSlot` instead of `allocSlot`, emit proper event output

**Changes:**
- Remove `void pulse` hack
- Call `ctx.b.allocEventSlot(pulse)` to get `EventSlotId`
- Emit in outputsById: `pulse: { k: 'event', id: pulse, slot: pulseSlot }`

**Acceptance Criteria:**
- [ ] Pulse output uses EventSlotId (not ValueSlot)
- [ ] Block lowering validation passes (pulse in outputsById matches outputs declaration)
- [ ] Pulse event evaluates to true every tick at runtime

---

### W9: Compile Pipeline Integration

**Files:**
- `src/compiler/compile.ts` — include eventSlotMeta in CompiledProgramIR
- `src/compiler/passes-v2/pass7-schedule.ts` — pass event slot count through ScheduleIR

**Changes:**
- ScheduleIR gets `eventSlotCount: number`
- CompiledProgramIR gets populated `eventSlotMeta` from builder
- `createProgramState` receives `eventSlotCount` to size `eventScalars`

**Acceptance Criteria:**
- [ ] EventSlotMeta built from builder's event slot registrations
- [ ] eventSlotCount flows from compiler → schedule → runtime state allocation
- [ ] eventScalars sized correctly

---

### W10: Tests

**File:** `src/runtime/__tests__/EventEvaluator.test.ts` (new)

**Test cases:**
- [ ] `const(true)` fires, `const(false)` doesn't
- [ ] `never` never fires
- [ ] `pulse(timeRoot)` fires every tick
- [ ] `combine(any, [a, b])` — fires if either fires
- [ ] `combine(all, [a, b])` — fires only if both fire
- [ ] `wrap(signal)` — fires on rising edge (0.4→0.6), doesn't fire on (0.6→0.8)
- [ ] `wrap(signal)` — doesn't fire on falling edge (0.6→0.4)
- [ ] `wrap(signal)` — NaN treated as false
- [ ] `wrap(signal)` — Inf treated as false
- [ ] Per-frame clearing: event fired in frame N is not visible in frame N+1
- [ ] Monotone OR: multiple writes to same slot, any true → stays true
- [ ] End-to-end: compile patch with InfiniteTimeRoot, execute frame, verify pulse slot = 1

---

### W11: Validation (pass6)

**Files:**
- `src/compiler/passes-v2/pass6-block-lowering.ts` — accept `k: 'event'` in output validation

**Changes:**
- The output validation that checks `outputsById` port names must accept event outputs
- Currently it may only check for `k: 'sig'` and `k: 'field'`

**Acceptance Criteria:**
- [ ] Block lowering validation accepts `k: 'event'` outputs
- [ ] No crash/error when InfiniteTimeRoot emits pulse as event output

---

### W12: Verification

- [ ] `npm run typecheck` — zero new errors
- [ ] `npm run test` — all tests pass (existing + new event tests)
- [ ] End-to-end: InfiniteTimeRoot block compiles, pulse event slot = 1 every frame

## Dependencies

```
W1 (types) → W2 (builder) → W3 (step) → W4 (pass7) → W9 (compile integration)
                                                          ↓
W5 (storage) → W6 (evaluator) → W7 (executor) → W8 (time-blocks) → W10 (tests)
                                                                       ↓
                                                              W11 (validation) → W12 (verify)
```

W1-W3 can be done first (types only, no runtime).
W5-W6 can be done in parallel with W4.
W7-W8 require both paths to converge.
W10-W12 are final validation.

## Risks

| Risk | Mitigation |
|------|-----------|
| ValueRefPacked change breaks existing event code in combine-utils | Grep all uses, update to EventSlotId |
| Existing tests use registerEventSlot with ValueSlot | Update tests to use new allocEventSlot |
| eventPrevPredicate indexed by EventExprId may collide if exprs are shared | Each EventExpr has unique ID from builder counter |
| ScheduleExecutor doesn't pass eventExprs to evaluator | Already on CompiledProgramIR.eventExprs |

## Out of Scope

- Per-lane events (storage='perLane', Uint8Array per instance) — no blocks emit these yet
- Event history/sparklines (spec §10.2 explicitly excludes)
- EventToSignalMask block (spec §9.2.1) — separate block implementation
- SampleHold block (spec §9.2.2) — separate block implementation
- Compiler validations for event port wiring (spec §11) — no event sinks exist yet
