# Sprint 3: Step Format Unification (Minimal)

Generated: 2026-02-01T14:00:00Z
Updated: 2026-02-01T15:00:00Z
Confidence: HIGH: 2, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
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

### P0: Unified Step Kind [HIGH]

**Files:** `src/compiler/ir/types.ts`, `src/compiler/backend/schedule-program.ts`

**Design Decisions (resolved):**

1. **Keep `ValueSlot` and `EventSlotId` separate.** They index different storage backends (`Float64Array` vs boolean array) and unifying would lose type safety at the branded-type level. The unified step uses a discriminated union target:
   ```typescript
   type EvalTarget =
     | { storage: 'value'; slot: ValueSlot }
     | { storage: 'event'; slot: EventSlotId }
   ```

2. **`StepMaterialize` remains separate.** It has fundamentally different fields (`instanceId`, `field`) and represents field materialization, not expression evaluation. The unification targets only the `evalSig`/`evalEvent` split. The full Step union becomes:
   ```typescript
   type Step =
     | StepEvalValue          // NEW: replaces StepEvalSig + StepEvalEvent
     | StepSlotWriteStrided   // unchanged
     | StepMaterialize        // unchanged (separate: has instanceId, different semantics)
     | StepRender             // unchanged
     | StepStateWrite         // unchanged
     | StepFieldStateWrite    // unchanged
     | StepContinuityMapBuild // unchanged
     | StepContinuityApply    // unchanged
   ```

3. **`EvalStrategy` is a const enum for hot-loop performance:**
   ```typescript
   const enum EvalStrategy {
     ContinuousScalar = 0,   // was evalSig, cardinality one
     ContinuousField  = 1,   // was evalSig but with field evaluation path
     DiscreteScalar   = 2,   // was evalEvent, cardinality one
     DiscreteField    = 3,   // future: field events
   }
   ```

**What to do:**
1. Define `StepEvalValue` in `types.ts`:
   ```typescript
   interface StepEvalValue {
     readonly kind: 'evalValue';
     readonly expr: ValueExprId;
     readonly target: EvalTarget;
     readonly strategy: EvalStrategy;
   }
   ```
2. Delete `StepEvalSig` and `StepEvalEvent` interfaces
3. Update `Step` union (8 variants instead of 9)
4. Update `schedule-program.ts` (lines 640-660): create `StepEvalValue` with strategy derived from `ValueExpr.type`
5. Update `IRBuilderImpl.ts`: replace `stepEvalSig()` and `stepEvalEvent()` with `stepEvalValue()`

**Strategy derivation** (compile-time, in schedule-program.ts):
```typescript
function deriveStrategy(type: CanonicalType): EvalStrategy {
  const temp = requireInst(type.extent.temporality, 'temporality');
  const card = requireInst(type.extent.cardinality, 'cardinality');
  if (temp.kind === 'continuous') {
    return card.kind === 'one' ? EvalStrategy.ContinuousScalar : EvalStrategy.ContinuousField;
  } else {
    return card.kind === 'one' ? EvalStrategy.DiscreteScalar : EvalStrategy.DiscreteField;
  }
}
```

**Why pre-resolved strategy (not runtime type inspection):**
The hot loop runs every frame. Looking up `ValueExpr.type.extent.temporality` per step per frame is wasteful when the answer is known at compile time. Pre-resolving during schedule construction gives zero runtime overhead. `const enum` inlines to integer constants.

**Acceptance Criteria:**
- [ ] No `evalSig` or `evalEvent` string literals in `src/compiler/ir/types.ts`
- [ ] `StepEvalValue` with `EvalTarget` and `EvalStrategy` defined
- [ ] Schedule construction derives strategy from CanonicalType via `deriveStrategy()`
- [ ] Executor switch uses `step.strategy` (integer), not kind strings
- [ ] No runtime type inspection in hot loop
- [ ] TypeScript compiles

### P1: Update Executor [HIGH]

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
