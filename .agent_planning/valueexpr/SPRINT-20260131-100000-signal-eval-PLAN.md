# Sprint: signal-eval - SignalEvaluator Migration

Generated: 2026-01-31-100000 (revised per ChatGPT review)
Confidence: HIGH: 1, MEDIUM: 3, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260131-090000.md

## Sprint Goal

Migrate SignalEvaluator to accept ValueExpr (signal-extent subset) with shadow evaluation mode that asserts equivalence against legacy evaluation before cutover.

## Scope

**Deliverables:**
- `evaluateValueExprSignal` function for signal-extent expressions
- Shadow evaluation mode: evaluate both legacy and ValueExpr, assert equal results
- Feature flag to toggle between legacy-only, shadow, and ValueExpr-only modes
- Integration with ScheduleExecutor for shadow mode activation

## Work Items

### P0 WI-1: ValueExpr Signal Evaluator Function

**Dependencies**: Sprint 2 (lowering pass) complete — ValueExpr table populated
**Spec Reference**: SignalEvaluator.ts evaluateSigExpr (lines 125-218) | **Status Reference**: EVALUATION-20260131-090000.md "Feasibility Assessment"

#### Description
Create `evaluateValueExprSignal()` that evaluates signal-extent ValueExpr nodes. This function handles the same 10 SigExpr cases but dispatches on ValueExpr kinds:

- `const` → return constValueAsNumber(expr.value)
- `slotRead` → return state.values.f64[expr.slot]
- `time` → switch on which (7 cases)
- `external` → return state.externalChannels.snapshot.getFloat(expr.channel)
- `kernel.map` → evaluate input, apply fn
- `kernel.zip` → evaluate inputs, apply fn
- `state` → return state.state[expr.stateSlot]
- `shapeRef` → return 0 (same as legacy)
- `kernel.reduce` → **bridge to legacy materializer** (see below)
- `eventRead` → return state.eventScalars[expr.eventSlot]

**Critical: reduce must work correctly, not return 0.**

For `kernel.reduce`: use the `valueToField` reverse mapping (migration-only appendix) to find the legacy FieldExprId, call the legacy materializer to produce the field buffer, then apply the reduce op (min/max/sum/avg) over the buffer. This bridges signal eval migration without requiring full materializer migration.

The function uses ValueExprId-based caching via typed arrays (not plain JS arrays).

#### Acceptance Criteria
- [ ] `evaluateValueExprSignal(id, valueExprs, state)` exists and handles all signal-extent kinds
- [ ] `kernel.reduce` correctly materializes field via legacy bridge and applies reduce op
- [ ] Caching works via `state.cache.valueExprValues[id]` (Float64Array) and `state.cache.valueExprStamps[id]` (Int32Array)
- [ ] NaN/Inf detection matches existing SignalEvaluator behavior
- [ ] Exhaustive switch with `never` check — no silent fallbacks
- [ ] Unit tests cover all 10 signal-extent cases including reduce with actual field data

#### Technical Notes
The function must skip field-extent and event-extent expressions (those would be evaluated by Materializer and EventEvaluator respectively). Add a runtime assertion: if the expression's extent has cardinality `many` or temporality `discrete`, throw an error (these are not signal-extent).

The reduce bridge via `valueToField` is migration-only. Once the Materializer is migrated (Sprint 5), reduce will call the ValueExpr materializer directly and the reverse mapping can be removed.

---

### P1 WI-2: ValueExpr Cache in RuntimeState

**Dependencies**: WI-1
**Spec Reference**: RuntimeState.ts cache structure | **Status Reference**: EVALUATION-20260131-090000.md "Cross-table evaluation"

#### Description
Add ValueExpr cache typed arrays to `RuntimeState.cache`:

```typescript
valueExprValues: Float64Array;   // Cached signal-extent evaluation results
valueExprStamps: Int32Array;     // Frame stamps for cache validity
```

These are parallel to existing `sigValues`/`sigStamps` but indexed by ValueExprId. They only cache signal-extent results (number). Field and event evaluators will use their own caching strategies.

**Do NOT use `number[]` for hot caches.** Use typed arrays for performance (Float64Array for values, Int32Array for stamps).

#### Acceptance Criteria
- [ ] `RuntimeState.cache` has `valueExprValues: Float64Array` and `valueExprStamps: Int32Array`
- [ ] Arrays are sized from `program.valueExprs.nodes.length` during state creation
- [ ] Cache invalidation follows same frame-stamp pattern as existing signal cache
- [ ] No performance regression in existing code paths
- [ ] ValueExpr cache is completely independent from legacy cache (no shared reads/writes)

#### Technical Notes
`createRuntimeState()` must allocate these arrays. Size them to the full ValueExpr table length even though only signal-extent entries will be cached — the index is ValueExprId which spans the whole table. Unused entries waste memory but simplify indexing (no offset calculation). During migration, when ValueExpr table is small, this overhead is negligible.

---

### P1 WI-3: Shadow Evaluation Mode

**Dependencies**: WI-1, WI-2, Sprint 2 (lowering pass)
**Spec Reference**: HANDOFF document "Incremental migration" | **Status Reference**: EVALUATION-20260131-090000.md "Do not attempt atomic migration"

#### Description
Add a shadow evaluation mode to ScheduleExecutor where both legacy and ValueExpr evaluation run, and results are compared. This catches any semantic divergence before cutover.

For each `StepEvalSig`:
1. Evaluate legacy: `evaluateSignal(step.expr, program.signalExprs.nodes, state)` → writes legacy cache
2. Look up ValueExprId: `program.valueExprs.sigToValue[step.expr]`
3. Evaluate ValueExpr: `evaluateValueExprSignal(veId, program.valueExprs.nodes, state)` → writes ValueExpr cache
4. Assert: `Math.abs(legacy - valueExpr) < EPSILON` (or both NaN)
5. Use legacy result for actual execution (ValueExpr is read-only validation)

**Critical isolation rule**: Shadow mode must not let ValueExpr evaluation read legacy caches or vice versa. The two evaluation paths must use completely separate cache fields. This is enforced by the separate `valueExprValues`/`valueExprStamps` arrays.

The shadow mode is controlled by a flag on RuntimeState or a compile-time constant.

#### Acceptance Criteria
- [ ] Shadow mode runs both evaluators for every signal step
- [ ] Legacy evaluation reads/writes only legacy caches; ValueExpr evaluation reads/writes only ValueExpr caches
- [ ] Mismatches logged with expression ID, legacy value, ValueExpr value
- [ ] Shadow mode can be enabled/disabled without code changes (flag)
- [ ] At least one end-to-end test compiles a real patch and runs shadow mode for 10 frames with zero mismatches
- [ ] No performance regression when shadow mode is disabled

#### Technical Notes
Epsilon for float comparison: use `1e-10` (same precision as existing tests). For NaN, both must be NaN. For Infinity, both must be same-sign infinity.

Shadow mode is inherently slower (2x evaluation). Only enable during development/testing, never in production. Consider using `import.meta.env.DEV` or a build-time flag.

---

### P2 WI-4: Signal-Only Cutover

**Dependencies**: WI-3 validated with zero mismatches across full test suite
**Spec Reference**: N/A (migration milestone) | **Status Reference**: EVALUATION-20260131-090000.md "Recommended Migration Order"

#### Description
After shadow mode validates equivalence, add a ValueExpr-only code path to ScheduleExecutor for signal evaluation. When enabled:
- `StepEvalSig` uses `evaluateValueExprSignal` instead of `evaluateSignal`
- `StepSlotWriteStrided` translates `SigExprId[]` to `ValueExprId[]` at dispatch time via `sigToValue` (do NOT change the step type)
- Legacy signal evaluation is not called

This is the first consumer that ACTUALLY uses ValueExpr in production.

#### Acceptance Criteria
- [ ] ScheduleExecutor can use ValueExpr-only path for signal steps
- [ ] `StepSlotWriteStrided` translates IDs at dispatch time (step type unchanged)
- [ ] All 2004+ tests pass in ValueExpr-only mode
- [ ] No rendering differences visible in manual testing
- [ ] Performance benchmark shows no significant regression (< 5%)

#### Technical Notes
This is the moment the migration becomes real. Legacy sigValues cache can be kept for backward compatibility (other consumers may still use it), but signal evaluation should route through ValueExpr.

## Dependencies
- Sprint 1 (type-fixes) must be complete
- Sprint 2 (lowering pass) must be complete
- WI-2 depends on WI-1
- WI-3 depends on WI-1, WI-2
- WI-4 depends on WI-3 passing validation

## Unknowns to Resolve
1. **Cache sizing**: Should ValueExpr cache be sized to full table or only signal-extent subset? Full table is simpler but wastes memory. Research: check ValueExpr table size for typical programs.
2. **Cross-evaluator calls**: The reduce bridge calls the legacy materializer from within ValueExpr signal evaluation. Confirm this does not create cache coherence issues (legacy materializer writes legacy field cache, which is separate from ValueExpr cache — should be fine).
3. **StepSlotWriteStrided performance**: Translating `SigExprId[]` → `ValueExprId[]` at dispatch time adds per-step overhead. Research: check how many strided write steps a typical program has.

## Exit Criteria (to raise MEDIUM items to HIGH)
- [ ] Cache sizing strategy decided
- [ ] Reduce bridge tested with actual field materialization
- [ ] StepSlotWriteStrided translation verified no performance impact
- [ ] Shadow mode prototype running for at least one simple program

## Risks
- **Semantic divergence**: If ValueExpr evaluation produces different results than legacy, the bug could be in either system. Mitigation: shadow mode catches divergence early; start with simplest expressions.
- **Cache coherence**: Two caching layers (legacy + ValueExpr) running simultaneously could mask bugs if one is stale. Mitigation: use frame stamps consistently; caches are completely isolated; shadow mode catches stale cache issues.
- **Field-extent expressions in signal table**: The unified ValueExpr table contains field and event expressions. A bug in extent checking could cause the signal evaluator to attempt evaluating a field expression. Mitigation: runtime assertion on extent.
- **Reduce bridge complexity**: The legacy materializer bridge adds a temporary cross-system dependency. Mitigation: this is explicitly migration-only code; it is removed when Sprint 5 completes.

## Cross-Sprint Enforcement
- After Sprint 2: no new runtime code may switch on `SigExpr.kind` / `FieldExpr.kind` / `EventExpr.kind` outside the legacy evaluators (grep test).
- After this sprint's cutover (WI-4): ScheduleExecutor routes signal steps through ValueExpr-only in CI (legacy path allowed only under an explicit flag).
- After Sprint 4 cutover: same for event steps.
- After Sprint 5 cutover: legacy expr tables no longer consulted by ScheduleExecutor in normal mode.
