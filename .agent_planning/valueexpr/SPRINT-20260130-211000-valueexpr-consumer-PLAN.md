# Sprint: valueexpr-consumer - First ValueExpr Consumer Migration

Generated: 2026-01-30T21:10:00
Confidence: HIGH: 0, MEDIUM: 2, LOW: 1
Status: RESEARCH REQUIRED
Source: EVALUATION-20260130-203000.md

## Sprint Goal

Migrate the first production consumer from legacy SigExpr/FieldExpr/EventExpr dispatch to the unified ValueExpr type, proving the canonical table works in practice.

## Scope

**Deliverables:**
- Research: determine optimal migration order and strategy
- Implement: first evaluator migrated to ValueExpr dispatch
- Validate: existing tests pass without behavioral changes

## Work Items

### P0 - Research: Migration Strategy and Order [MEDIUM]

**Dependencies**: valueexpr-cleanup sprint (P0 ValueExprId fix must land first)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rules 1, 12 | **Status Reference**: EVALUATION-20260130-203000.md "Deferred Work Assessment" (oscilla-animator-v2-bzh2), "Ambiguities Found" row 4

#### Description

Before migrating any consumer, we need to answer key design questions about how the three legacy expression tables (signals[], fields[], events[]) merge into a single values[] table, and how the dispatch surface changes. The current runtime has THREE parallel dispatch chains:

1. **SignalEvaluator** (`evaluateSigExpr`, line 134): `switch (expr.kind)` over 10 SigExpr variants
2. **Materializer** (`fillBuffer`, line 288): `switch (expr.kind)` over 9 FieldExpr variants
3. **EventEvaluator** (`evaluateEvent`, line 36): `switch (expr.kind)` over 5 EventExpr variants

These are called from **ScheduleExecutor** steps:
- `evalSig` -> `evaluateSignal(step.expr, signals, state)` where `signals = program.signalExprs.nodes`
- `materialize` -> `materialize(step.field, ..., fields, signals, ...)` where `fields = program.fieldExprs.nodes`
- `evalEvent` -> `evaluateEvent(step.event, eventExprs, state, signals)`

The migration must determine:
1. Do we merge all three dense arrays into one `values: ValueExpr[]`? Or keep separate arrays but change the element type?
2. How does `ScheduleExecutor` dispatch change? Currently step.kind determines which evaluator to call.
3. Does `IRBuilder` emit ValueExpr objects alongside (or instead of) legacy objects?
4. Can we do this incrementally (one evaluator at a time) or must it be atomic?

#### Acceptance Criteria
- [ ] Written decision document: which evaluator migrates first and why
- [ ] Written decision: single `values[]` array vs. three arrays with new element types
- [ ] Written decision: IRBuilder dual-emit strategy (if incremental) or big-bang strategy
- [ ] Prototype: IRBuilder emits at least one ValueExpr kind alongside its legacy equivalent (proving the plumbing works)

#### Unknowns to Resolve
1. **Array merging**: If we merge signals+fields+events into one `values: ValueExpr[]`, all IDs become ValueExprId. But the ScheduleExecutor currently uses `SigExprId`, `FieldExprId`, `EventExprId` in step types. How do step types change? **Research approach**: Examine all Step variants in `src/compiler/ir/types.ts` to catalog every ID reference.
2. **Evaluator unification**: Should there be ONE `evaluateValueExpr()` function that subsumes all three evaluators? Or should the three evaluators just accept `ValueExpr` instead of their legacy type? **Research approach**: Compare the three evaluators' return types (number, Float32Array, boolean) -- they are fundamentally different, suggesting three evaluators remain but accept ValueExpr.
3. **Cache structure**: `state.cache.sigValues[]` is indexed by `SigExprId`. If IDs merge, cache layout changes. **Research approach**: Examine RuntimeState.ts cache structure.
4. **IRBuilder emission**: Does IRBuilder.ts need to emit ValueExpr in addition to legacy exprs during migration? **Research approach**: Check if any existing code reads from `program.signalExprs.nodes` by index -- if so, the dense array must remain stable during incremental migration.

#### Exit Criteria (to reach HIGH confidence)
- [ ] All 4 unknowns above have documented answers
- [ ] At least one ValueExpr kind has been round-tripped through IRBuilder -> array -> evaluator in a test
- [ ] Migration approach validated as incremental (safe) or atomic (required) with rationale

---

### P1 - Migrate SignalEvaluator to ValueExpr [MEDIUM]

**Dependencies**: P0 research complete
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rules 1, 6, 12 | **Status Reference**: EVALUATION-20260130-203000.md "ValueExpr consumers: NOT STARTED"

#### Description

Migrate `SignalEvaluator.evaluateSigExpr()` to accept ValueExpr instead of SigExpr. This is likely the best first consumer because:
- Signal evaluation is the simplest dispatch (scalar in, scalar out)
- 10 SigExpr variants map cleanly to ValueExpr kinds (see LEGACY_MAPPING in value-expr.ts)
- SignalEvaluator has the most straightforward caching model

The migration involves:
1. Change `evaluateSigExpr` to accept `ValueExpr` and dispatch on its 9 kinds
2. Handle the `slot` case: SigExprSlot has no ValueExpr equivalent (it is a materialization detail). Either keep a special case or move slot reads to ScheduleExecutor.
3. Update `evaluateSignal` to use the new dispatch
4. Ensure caching still works with the new ID type

#### Acceptance Criteria
- [ ] `evaluateSigExpr` accepts `ValueExpr` (or a subset type) instead of `SigExpr`
- [ ] All signal-related test cases pass
- [ ] SigExprSlot handling is documented (kept as special case or moved out)
- [ ] No behavioral changes: same outputs for same inputs
- [ ] Performance: no measurable regression in `npm run bench` (signal evaluation is hot loop)

#### Unknowns to Resolve
1. **SigExprSlot**: This variant reads from a ValueSlot directly. It has no ValueExpr equivalent by design ("Not a ValueExpr - materialization detail"). Where does this read move to? **Research approach**: Check all call sites that emit SigExprSlot in IRBuilder.
2. **Return type compatibility**: SignalEvaluator returns `number`. ValueExpr includes field/event kinds that return different types. If we pass a field-kind ValueExpr to the signal evaluator, what happens? **Research approach**: Type-level guard -- the evaluator should only accept signal-extent ValueExpr.

#### Exit Criteria (to reach HIGH confidence)
- [ ] SigExprSlot handling strategy decided and documented
- [ ] Type-level guard for signal-extent ValueExpr exists or is unnecessary (documented why)

#### Technical Notes
- The `evaluateSigExpr` switch at `SignalEvaluator.ts:134` is the primary dispatch surface
- Legacy SigExpr kinds: const, slot, time, external, map, zip, stateRead, shapeRef, reduceField, eventRead
- ValueExpr mapping: const->const, time->time, external->external, map->kernel(map), zip->kernel(zip), stateRead->state, shapeRef->shapeRef, reduceField->kernel(reduce), eventRead->eventRead
- `slot` has NO mapping (intentional)

---

### P2 - Audit IRBuilder Emission Path [LOW]

**Dependencies**: P0 research complete
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 14 (Frontend/Backend Boundary) | **Status Reference**: EVALUATION-20260130-203000.md "ValueExpr canonical table: COMPLETE (definition only)"

#### Description

IRBuilder currently builds legacy SigExpr/FieldExpr/EventExpr objects and stores them in `program.signalExprs`, `program.fieldExprs`, `program.eventExprs`. For ValueExpr to have consumers, IRBuilder must also (or instead) emit ValueExpr objects into a `program.valueExprs` table.

This work item assesses the full IRBuilder surface area and plans the emission migration:
- How many builder methods need ValueExpr emission?
- Can we add a `valueExprs` array alongside the legacy arrays during migration?
- When do legacy arrays get removed?

#### Acceptance Criteria
- [ ] Complete catalog of IRBuilder methods that emit expressions (signal, field, event)
- [ ] Migration plan: dual-emit (safe, incremental) vs. replacement (atomic, risky)
- [ ] Prototype: at least one builder method emits both legacy and ValueExpr

#### Unknowns to Resolve
1. **CompiledProgramIR shape**: Adding `valueExprs` to the program IR changes the program type. How many consumers read from this type? **Research approach**: Check all imports of CompiledProgramIR.
2. **ID mapping**: During dual-emit, SigExprId(5) and ValueExprId(5) refer to different expressions. How do we prevent confusion? **Research approach**: Consider using a mapping table or ensuring IDs are allocated from different ranges.
3. **Memory overhead**: Dual-emit doubles expression storage during migration. Is this acceptable for the hot path? **Research approach**: Measure current expression count in a representative graph.

#### Exit Criteria (to reach MEDIUM confidence)
- [ ] IRBuilder method catalog complete
- [ ] Dual-emit vs. replacement decision made
- [ ] At least one method prototyped

## Dependencies

```
valueexpr-cleanup (must complete first)
    |
    v
P0: Research (migration strategy)
    |
    +---> P1: SignalEvaluator migration
    |
    +---> P2: IRBuilder emission audit
```

## Risks

- **Risk**: ValueExpr kind dispatch is slower than legacy dispatch due to more cases in the switch.
  **Mitigation**: Benchmark before/after. The ValueExpr switch has 9 cases vs. SigExpr's 10, FieldExpr's 9, EventExpr's 5. Unified dispatch may actually be faster due to branch predictor locality.

- **Risk**: SigExprSlot has no ValueExpr equivalent, creating an awkward special case that persists.
  **Mitigation**: Research in P0 will determine if slot reads should move to ScheduleExecutor step handling (which already has slot-write logic).

- **Risk**: Incremental migration creates a long period of dual types, increasing cognitive load and bug surface.
  **Mitigation**: Set explicit timeline: cleanup sprint + consumer sprint should complete within one branch. If dual types persist beyond that, escalate.

- **Risk**: Cache invalidation / ID confusion during dual-emit.
  **Mitigation**: P0 research must produce a clear ID mapping strategy before any emission code changes.
