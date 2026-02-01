# Sprint 3: Step Format Unification (Minimal)

Generated: 2026-02-01T14:00:00Z
Confidence: HIGH: 0, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Supersedes: SPRINT-20260201-120000-step-unification (rescoped: format only, no runtime semantics)
Depends on: Sprint 1 + Sprint 2

## Sprint Goal

Remove the parallel classification system (`evalSig`/`evalEvent` step discriminants) by making schedule step dispatch derive from `CanonicalType`. Scope is purely representational -- the schedule format stops encoding "kind". Runtime semantics (branch state, lane metadata, stamps) are explicitly deferred to Sprint 4.

## Design Decision: Minimal Unification

The schedule format changes, but the executor can keep internal code splits (signal evaluator vs event evaluator). The key change is:
- Steps no longer carry `evalSig`/`evalEvent` as their discriminant
- Each step carries `valueExprId` and `target` slot
- Runtime dispatch is derived from `ValueExpr.type.extent.temporality` and `extent.cardinality`
- This is pre-resolved during schedule construction (no runtime type inspection in hot loop)

## Scope

**Deliverables:**
1. Replace `evalSig`/`evalEvent` step kinds with unified step kind
2. Schedule construction derives dispatch strategy from CanonicalType
3. Executor dispatches based on pre-resolved strategy (no runtime type inspection)
4. Un-skip enforcement test 4 from Sprint 1

**Explicitly deferred (Sprint 4):**
- Branch-scoped state
- Explicit lane metadata
- Event stamp buffers
- Unified `evaluateValue()` function

## Work Items

### P0: Unified Step Kind [MEDIUM]

**Files:** `src/compiler/ir/types.ts`, `src/compiler/backend/schedule-program.ts`

**What to do:**
1. Replace `StepEvalSig` and `StepEvalEvent` with a single `StepEvalValue` (or similar)
2. The step carries:
   - `valueExprId: ValueExprId`
   - `target: ValueSlot | EventSlotId` (or a unified slot type)
   - `strategy: EvalStrategy` — pre-resolved from CanonicalType during schedule construction
3. `EvalStrategy` is a small enum derived from `(temporality, cardinality)`:
   - `continuous_one` (scalar signal)
   - `continuous_many` (field)
   - `discrete_one` (scalar event)
   - `discrete_many` (field event, if applicable)

**Why pre-resolved strategy (not runtime type inspection):**
The hot loop runs every frame. Looking up `ValueExpr.type.extent.temporality` per step per frame is wasteful when the answer is known at compile time. Pre-resolving during schedule construction gives zero runtime overhead.

**Acceptance Criteria:**
- [ ] No `evalSig` or `evalEvent` string literals in `src/compiler/ir/types.ts`
- [ ] Schedule construction derives strategy from CanonicalType
- [ ] Executor switch uses strategy enum, not kind strings
- [ ] No runtime type inspection in hot loop
- [ ] TypeScript compiles

#### Unknowns to Resolve
- Exact unified slot type (keep separate `ValueSlot`/`EventSlotId`, or unify?)
- Whether `StepMaterialize` should also be unified or remain separate

#### Exit Criteria (to reach HIGH)
- [ ] Step kind design finalized
- [ ] All existing step kinds mapped to new model

### P1: Update Executor [MEDIUM]

**File:** `src/runtime/ScheduleExecutor.ts`

**What to do:**
1. Replace `case 'evalSig':` and `case 'evalEvent':` with dispatch on `step.strategy`
2. The internal evaluation code can remain split (signal path vs event path)
3. The key change is the discriminant: from `step.kind` (string) to `step.strategy` (enum)

**Performance constraint:** Frame execution time must not regress. Benchmark before and after.

**Acceptance Criteria:**
- [ ] No `evalSig` or `evalEvent` case labels in ScheduleExecutor
- [ ] Frame execution benchmark shows no regression
- [ ] All runtime tests pass

## Dependencies
- Sprint 1: enforcement tests provide the guardrails
- Sprint 2: frontend solver provides fully resolved types that make strategy derivation possible

## Risks
- **Risk**: Performance regression in hot loop. **Mitigation**: Pre-resolved strategy enum has same perf characteristics as current string switch. Benchmark to confirm.
- **Risk**: Large surface area (many files reference step kinds). **Mitigation**: Mechanical rename with TypeScript compiler guiding all call sites.
