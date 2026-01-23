# Definition of Done: Event System

**Generated:** 2026-01-22
**Topic:** time-model / events
**Spec:** `design-docs/_new/10-Events-1.md`

---

## Overall Acceptance

Work is NOT complete unless ALL criteria are met:

### Types & IR

- [ ] `EventSlotId` is a branded numeric type distinct from `ValueSlot`
- [ ] `EventSlotMetaEntry` exists with `slot`, `cardinality`, `storage`, `scalarOffset` fields
- [ ] `CompiledProgramIR` has `eventSlotMeta: readonly EventSlotMetaEntry[]`
- [ ] `StepEvalEvent` step kind exists with `expr: EventExprId`, `target: EventSlotId`
- [ ] `Step` union includes `StepEvalEvent`
- [ ] `ValueRefPacked` event variant uses `EventSlotId` (not ValueSlot)
- [ ] TypeScript rejects `EventSlotId` where `ValueSlot` is expected (and vice versa)

### IRBuilder

- [ ] `allocEventSlot(eventId: EventExprId): EventSlotId` allocates from event-specific counter
- [ ] `getEventSlotCount(): number` returns total event slots allocated
- [ ] `getEventSlots(): ReadonlyMap<EventExprId, EventSlotId>` returns all mappings
- [ ] Old `registerEventSlot(eventId, slot: ValueSlot)` is removed

### Compiler (Pass 7 + compile.ts)

- [ ] `ScheduleIR` has `eventSlotCount: number`
- [ ] Pass 7 emits `StepEvalEvent` steps for all registered event slots
- [ ] evalEvent steps ordered after continuityApply, before render
- [ ] `CompiledProgramIR.eventSlotMeta` populated correctly
- [ ] `eventSlotCount` flows to runtime state allocation

### Runtime Storage

- [ ] `ProgramState` and `RuntimeState` have `eventScalars: Uint8Array`
- [ ] `ProgramState` and `RuntimeState` have `eventPrevPredicate: Uint8Array`
- [ ] `createProgramState(slotCount, stateSlotCount, eventSlotCount)` allocates correctly
- [ ] Both arrays cleared to 0 on recompile

### Event Evaluator

- [ ] `evaluateEvent()` function in `src/runtime/EventEvaluator.ts`
- [ ] `const(true)` → true, `const(false)` → false
- [ ] `never` → false (always)
- [ ] `pulse(timeRoot)` → true (every tick)
- [ ] `combine(any, [...])` → OR of inputs
- [ ] `combine(all, [...])` → AND of inputs
- [ ] `wrap(signal)` → rising edge of `signal >= 0.5`
- [ ] `wrap` treats NaN/Inf as false (no edge)
- [ ] `wrap` uses and updates `eventPrevPredicate`

### ScheduleExecutor

- [ ] `eventScalars.fill(0)` at start of every frame (before any step execution)
- [ ] `evalEvent` step dispatched correctly
- [ ] Fired event writes 1 to `eventScalars[target]`
- [ ] Monotone OR: if slot already 1, stays 1

### time-blocks.ts (Pulse Output)

- [ ] Pulse output port declared with `signalTypeTrigger('bool')`
- [ ] Lowering calls `ctx.b.allocEventSlot(pulse)` (not `allocSlot()`)
- [ ] Pulse emitted in `outputsById` as `{ k: 'event', id, slot }`
- [ ] Block lowering validation accepts event outputs

### Tests

- [ ] All EventEvaluator cases tested (const, never, pulse, combine, wrap)
- [ ] Wrap edge detection tested (rising/falling/NaN/Inf)
- [ ] Per-frame clearing tested (event not visible next frame)
- [ ] End-to-end: InfiniteTimeRoot compiles + executes, pulse slot = 1

### Build

- [ ] `npm run typecheck` — zero new errors
- [ ] `npm run test` — all tests pass (existing + new)
- [ ] No `ValueSlot` used for event storage anywhere

---

## NOT Required (Out of Scope)

- Per-lane events (no blocks emit these yet)
- Event history/sparklines (spec §10.2)
- EventToSignalMask block (spec §9.2.1)
- SampleHold block (spec §9.2.2)
- Compiler validation for event port wiring (spec §11) — no event sinks exist yet
- Debug visualization of events (FIRED badge) — separate UI work
