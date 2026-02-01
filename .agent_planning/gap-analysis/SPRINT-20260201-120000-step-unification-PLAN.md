# SUPERSEDED — See SPRINT-20260201-140000-step-format-PLAN.md (rescoped to format only)
# Sprint: Step-Unification - Replace Hard-Coded Step Kinds with Type-Driven Dispatch

Generated: 2026-02-01T12:00:00Z
Confidence: HIGH: 0, MEDIUM: 1, LOW: 2
Status: RESEARCH REQUIRED
Source: EVALUATION-20260201-120000.md

## Sprint Goal

Research and design a type-driven dispatch model for schedule steps, replacing the hard-coded `evalSig`/`evalEvent` discriminants with dispatch derived from `CanonicalType`. This sprint focuses on raising confidence to enable implementation in a follow-up sprint.

## Scope

**Deliverables:**
- Design document: unified step dispatch model
- Prototype or proof-of-concept showing type-driven dispatch
- Lane identity tracking design (dependent on step unification)
- Decision record on approach for implementation sprint

## Work Items

### P1: Design Unified Step Dispatch Model [MEDIUM]

**Dependencies**: User decisions #6 (cardinality polymorphism) and #9 (ValueSlot vs explicit keying)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #2 "Derived Kind Must Be Total and Deterministic" | **Status Reference**: SUMMARY.md P2 #3, critical/topic-runtime-enforcement.md C1

#### Description
The schedule IR currently uses separate step kinds for different value families:

```typescript
// Current (src/compiler/ir/types.ts)
type Step =
  | StepEvalSig        // kind: 'evalSig' - evaluate signal to ValueSlot
  | StepSlotWriteStrided // strided write for multi-component signals
  | StepMaterialize    // materialize field values
  | StepRender         // render operations
  | StepStateWrite     // scalar state writes
  | StepFieldStateWrite // field state writes
  | StepContinuityMapBuild / StepContinuityApply
  | StepEvalEvent;     // kind: 'evalEvent' - evaluate event to EventSlotId
```

The executor (`ScheduleExecutor.ts:213`) switches on `step.kind` with cases for `evalSig` and `evalEvent`. This creates a parallel classification system that bypasses `CanonicalType`.

**Goal**: Design a model where step dispatch is derived from the expression's `CanonicalType` rather than hard-coded discriminants.

**Possible approaches:**

**Option A: Unified `evalValue` step**
- Single step kind `evalValue` with a `ValueExprId` and `target` slot
- Executor inspects `type.extent.temporality` and `type.extent.cardinality` to determine evaluation strategy
- Pros: Simplest change, minimal IR modification
- Cons: Runtime type inspection on every step (perf concern in hot loop)

**Option B: Type-derived step kind**
- Keep multiple step kinds but derive them mechanically from `CanonicalType` during schedule construction
- Step kind = `eval_${temporality}_${cardinality}` (e.g., `eval_continuous_one`, `eval_continuous_many`, `eval_discrete_one`)
- Pros: No runtime type inspection, clear mapping
- Cons: Still has explicit step kinds, just derived differently

**Option C: Strategy pattern**
- Each step carries a pre-resolved evaluation strategy (function pointer or enum)
- Strategy is selected once during schedule construction based on type
- Executor calls strategy without inspecting types
- Pros: Zero runtime type inspection, extensible
- Cons: More complex IR, indirection

#### Acceptance Criteria
- [ ] Design document produced with chosen approach and rationale
- [ ] At least 2 approaches evaluated with pros/cons
- [ ] Performance impact analysis for hot loop (ScheduleExecutor runs every frame)
- [ ] Migration path from current step kinds to new model documented
- [ ] Backward compatibility strategy (can old and new coexist during migration?)

#### Unknowns to Resolve
1. **Performance** - Is runtime type inspection (Option A) acceptable in the hot loop? ScheduleExecutor processes every step every frame.
2. **Step kind granularity** - Should materialize/render/stateWrite also be unified, or just evalSig/evalEvent?
3. **Event storage model** - Events currently use separate `EventSlotId` storage. Unified dispatch would need to handle this.
4. **Field evaluation** - Fields currently go through `StepMaterialize` (not `evalSig` or `evalEvent`). How does this fit?

#### Exit Criteria (to reach HIGH confidence)
- [ ] Approach chosen with user sign-off
- [ ] Performance prototype demonstrates no regression in frame execution time
- [ ] All current step kinds mapped to new model

---

### P2: Design Lane Identity Tracking [LOW]

**Dependencies**: Step unification approach (#3), decision #9 (ValueSlot vs explicit keying)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #10 | **Status Reference**: SUMMARY.md P2 #5, critical/topic-runtime-enforcement.md C3

#### Description
Field state writes currently use implicit offset math (`state[baseSlot + i]`) without tracking which lane belongs to which instance. The spec requires explicit lane metadata: a mapping from `(ValueExprId, instanceId, lane)` to state slot.

This design depends on the step unification model because the lane identity must be accessible during step execution.

#### Acceptance Criteria
- [ ] Design document describes lane identity data structure
- [ ] Mapping from (ValueExprId, lane) -> slot is explicit and queryable
- [ ] Hot-swap scenario documented: how lane identity survives recompilation
- [ ] Integration with step unification model described

#### Unknowns to Resolve
1. **Slot allocation** - Currently `RuntimeState.state` is a flat `Float64Array`. Adding lane metadata requires either parallel metadata arrays or a structured slot allocator.
2. **Performance** - Adding metadata lookup per-lane per-frame may be expensive. Need to measure.
3. **Hot-swap** - When instance count changes (10 circles -> 15 circles), how do lanes remap?
4. **Overlap with continuity** - `ContinuityMapBuild`/`ContinuityApply` steps already handle some lane mapping. How do these relate?

#### Exit Criteria (to reach HIGH confidence)
- [ ] User has decided ValueSlot vs explicit keying (#9)
- [ ] Prototype lane metadata for a single field expression
- [ ] Performance benchmark: lane-aware vs current offset math

---

### P3: Evaluate Branch-Scoped State (Deferred) [LOW]

**Dependencies**: Step unification (#3), v1+ branch axis values (#16)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #6 | **Status Reference**: SUMMARY.md P2 #4, critical/topic-runtime-enforcement.md C2

#### Description
Runtime state storage (`RuntimeState.state: Float64Array`) is not keyed by branch. For v1+ branch axis support, state must be scoped per-branch so parallel timelines maintain separate state.

This is deferred until (a) step unification provides the dispatch model and (b) branch axis values are implemented (#16, P5). Including here for completeness and dependency tracking.

#### Acceptance Criteria
- [ ] Scope and requirements documented
- [ ] Dependency on step unification and branch axis clearly stated
- [ ] Estimated effort for implementation

#### Unknowns to Resolve
1. **Branch axis timeline** - When are v1+ branch values needed? Is this a v2.0 or v2.x feature?
2. **State isolation model** - Copy-on-write per branch? Separate state arrays? Keyed slots?
3. **Memory budget** - Branched state multiplies memory by branch count. Acceptable?

#### Exit Criteria (to reach HIGH confidence)
- [ ] Branch axis values implemented (P5 #16)
- [ ] Step unification complete
- [ ] State isolation model chosen and prototyped

## Dependencies
- Sprint B (type-compat-purity): cardinality polymorphism decision informs step dispatch
- Sprint C (frontend-instance): instance resolution model affects lane identity
- User decisions #6, #9 needed before implementation
- Branch-scoped state (#4) deferred to v1+ branch axis

## Risks
- **Risk**: Step unification touches the hot loop (ScheduleExecutor). Performance regression possible. **Mitigation**: Benchmark before and after; Option B/C avoid runtime type inspection.
- **Risk**: Large surface area -- step unification affects schedule construction, executor, and state management. **Mitigation**: Incremental migration; keep old step kinds working during transition.
- **Risk**: Lane identity tracking may require significant RuntimeState restructuring. **Mitigation**: Design phase first; don't commit to implementation until design is validated.
