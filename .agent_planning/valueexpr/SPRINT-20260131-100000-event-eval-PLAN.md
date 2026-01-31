# Sprint: event-eval - EventEvaluator Migration

Generated: 2026-01-31-100000 (revised per ChatGPT review)
Confidence: HIGH: 0, MEDIUM: 1, LOW: 2
Status: RESEARCH REQUIRED
Source: EVALUATION-20260131-090000.md

## Sprint Goal

Migrate EventEvaluator to accept ValueExpr (event-extent subset) with shadow evaluation, reusing the pattern established by SignalEvaluator migration.

## Scope

**Deliverables:**
- `evaluateValueExprEvent` function for event-extent expressions
- Shadow evaluation mode for events (parallel to signal shadow mode)
- Integration with ScheduleExecutor for StepEvalEvent steps
- Cross-evaluator call: event.wrap invokes signal evaluator on ValueExpr
- Separate prevPredicate arrays for legacy vs ValueExpr (shadow state isolation)

## Work Items

### P0 WI-1: ValueExpr Event Evaluator Function

**Dependencies**: Sprint 3 (signal-eval) WI-1 complete (event.wrap needs signal evaluation)
**Spec Reference**: EventEvaluator.ts (lines 25-67) | **Status Reference**: EVALUATION-20260131-090000.md "EventEvaluator returns boolean"

#### Description
Create `evaluateValueExprEvent()` that evaluates event-extent ValueExpr nodes. The legacy EventEvaluator handles 5 cases; the ValueExpr version dispatches on `eventKind`:

- `const` → return expr.fired
- `never` → return false
- `pulse` → return true (fires every tick, same as legacy — do not invent timing semantics)
- `combine` → evaluate inputs with mode (any/all)
- `wrap` → evaluate input signal via `evaluateValueExprSignal()`, edge detection

**Important**: `eventRead` is a SIGNAL expression (returns 0/1 scalar float), NOT an event expression. It must NOT be evaluated by the event evaluator. It is handled by the signal evaluator in Sprint 3.

Key cross-evaluator concern: `event.wrap` must evaluate a signal-extent ValueExpr via `evaluateValueExprSignal()`. This works because signal evaluation is already migrated (Sprint 3).

#### Acceptance Criteria
- [ ] `evaluateValueExprEvent(veId, valueExprs, state)` exists and returns boolean
- [ ] Handles all 5 event kinds (const, never, pulse, combine, wrap)
- [ ] Does NOT handle `eventRead` (that is a signal-extent expression)
- [ ] Combine mode 'any'/'all' correctly implements OR/AND semantics
- [ ] Wrap edge detection uses same predicate as legacy (>= 0.5, rising edge)
- [ ] Uses `evaluateValueExprSignal` for wrap's signal input (cross-evaluator call)
- [ ] Unit tests cover all 5 event kinds

#### Technical Notes
Event evaluation does NOT use the same caching pattern as signals. Events are boolean and evaluated per-step, not cached by ID. The legacy EventEvaluator has no cache — it evaluates directly. Follow the same pattern.

---

### P0 WI-2: Separate Edge Detection State Arrays

**Dependencies**: WI-1
**Spec Reference**: EventEvaluator.ts:61-64 (eventPrevPredicate) | ChatGPT review: "shadow state contamination"

#### Description
Event wrap is stateful — it uses `eventPrevPredicate` to detect rising edges. In shadow mode, if legacy and ValueExpr share the same prevPredicate array, running both evaluators will corrupt the state and produce false mismatches.

**Required**: Legacy and ValueExpr must use SEPARATE prevPredicate arrays:

```typescript
// In RuntimeState:
eventPrevPredicateLegacy: number[];   // indexed by EventExprId (existing array, renamed)
eventPrevPredicateValue: number[];    // indexed by ValueExprId (new array)
```

During shadow mode:
- Legacy event evaluator reads/writes `eventPrevPredicateLegacy`
- ValueExpr event evaluator reads/writes `eventPrevPredicateValue`

After cutover, `eventPrevPredicateLegacy` can be removed.

#### Acceptance Criteria
- [ ] `state.eventPrevPredicateLegacy` exists (renamed from `state.eventPrevPredicate`)
- [ ] `state.eventPrevPredicateValue` exists (new, sized from ValueExpr table length)
- [ ] Legacy evaluator uses only `eventPrevPredicateLegacy`
- [ ] ValueExpr evaluator uses only `eventPrevPredicateValue`
- [ ] Rising edge detection produces identical results in both evaluators for all test cases
- [ ] State persists across frames correctly (not reset between ticks)

#### Technical Notes
Allocate `eventPrevPredicateValue` in `createRuntimeState()`. Size to `program.valueExprs.nodes.length` (only event-extent entries will be used, but index by ValueExprId for simplicity).

---

### P1 WI-3: Event Shadow Evaluation Mode

**Dependencies**: WI-1, WI-2, Sprint 3 WI-3 (shadow mode infrastructure)
**Spec Reference**: N/A (migration infrastructure) | **Status Reference**: EVALUATION-20260131-090000.md "Do not attempt atomic migration"

#### Description
Extend shadow evaluation to cover StepEvalEvent steps. For each event step:
1. Evaluate legacy: `evaluateEvent(step.expr, program.eventExprs.nodes, state, program.signalExprs.nodes)` → uses `eventPrevPredicateLegacy`
2. Look up ValueExprId: `program.valueExprs.eventToValue[step.expr]`
3. Evaluate ValueExpr: `evaluateValueExprEvent(veId, program.valueExprs.nodes, state)` → uses `eventPrevPredicateValue`
4. Assert: `legacyResult === valueExprResult` (exact boolean equality)
5. Use legacy result for actual execution

#### Acceptance Criteria
- [ ] Shadow mode covers StepEvalEvent in ScheduleExecutor
- [ ] Boolean comparison (not epsilon — events are exact)
- [ ] Legacy and ValueExpr use separate prevPredicate arrays (no state contamination)
- [ ] Mismatches logged with expression ID and both values
- [ ] End-to-end test: compile patch with events (including wrap for edge detection), run shadow mode, zero mismatches

#### Technical Notes
Boolean comparison is simpler than float comparison — exact equality required. If legacy returns true and ValueExpr returns false (or vice versa), that's a definitive bug.

## Dependencies
- Sprint 1 (type-fixes) must be complete
- Sprint 2 (lowering pass) must be complete
- Sprint 3 (signal-eval) WI-1 must be complete (for cross-evaluator calls)

## Unknowns to Resolve
1. **Combine recursion**: Legacy `evaluateEvent` is recursive (combine calls evaluateEvent for each sub-event). ValueExpr combine does the same but with ValueExprId references. Do we need a recursion depth limit? Research: check maximum combine nesting in practice.
2. **Event caching**: Should we add caching for event evaluation? Legacy doesn't cache, but with a unified table, events might be evaluated multiple times (e.g., same event referenced by multiple combines). Research: profile event evaluation frequency.

## Exit Criteria (to raise confidence)
- [ ] Combine recursion depth confirmed safe
- [ ] Event caching decision made
- [ ] Signal evaluator migration (Sprint 3) validated in shadow mode
- [ ] Shadow mode with separate prevPredicate arrays tested on wrap events

## Risks
- **Cross-evaluator coupling**: Event.wrap depends on signal evaluation. If signal evaluation has bugs, event evaluation inherits them. Mitigation: Sprint 3 shadow mode must be validated first.
- **Edge detection divergence**: If edge detection state arrays get out of sync between legacy and ValueExpr, wrap events will fire at different times. Mitigation: separate arrays prevent contamination; shadow mode catches any divergence.

## Cross-Sprint Enforcement
- After Sprint 2: no new runtime code may switch on `SigExpr.kind` / `FieldExpr.kind` / `EventExpr.kind` outside the legacy evaluators (grep test).
- After Sprint 3 cutover: ScheduleExecutor routes signal steps through ValueExpr-only in CI.
- After this sprint's cutover: same for event steps.
- After Sprint 5 cutover: legacy expr tables no longer consulted by ScheduleExecutor in normal mode.
