# Sprint: validation-cutover - Shadow Validation & Cutover

Generated: 2026-01-31-120000
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260131-110000.md

## Sprint Goal

Validate ValueExpr evaluator equivalence via shadow mode, enable cutover flags, and clean up migration artifacts.

## Work Items

### P0 WI-1: Make Shadow/Cutover Flags Injectable (HIGH)

**Dependencies**: None
**Source**: EVALUATION rec #4 — flags are untestable hardcoded `const`

#### Description
Replace the 4 module-level `const` flags in ScheduleExecutor.ts with an injectable configuration object. Tests can pass a config; production uses defaults.

```typescript
interface EvalMode {
  shadowSignal: boolean;
  shadowEvent: boolean;
  shadowMaterialize: boolean;
  valueExprSignal: boolean;
  valueExprEvent: boolean;
  valueExprMaterialize: boolean;
}
const DEFAULT_EVAL_MODE: EvalMode = { /* all false */ };
```

Pass `evalMode` as a parameter to `executeFrame()` or attach to RuntimeState.

#### Acceptance Criteria
- [ ] All flags accessible via a single config object (not 6 separate module consts)
- [ ] Tests can enable any flag without editing source
- [ ] Default behavior is legacy-only (backward compatible)
- [ ] TypeScript compiles, all tests pass

---

### P0 WI-2: Add Event Cutover Flag (HIGH)

**Dependencies**: WI-1
**Source**: EVALUATION rec #3 — event cutover path missing

#### Description
Add `valueExprEvent` cutover path in ScheduleExecutor for `StepEvalEvent`. When enabled, use `evaluateValueExprEvent()` instead of legacy `evaluateEvent()`. Write result to event slot same as legacy.

#### Acceptance Criteria
- [ ] `valueExprEvent` flag in EvalMode
- [ ] When enabled, StepEvalEvent uses ValueExpr evaluator exclusively
- [ ] TypeScript compiles, all tests pass

---

### P0 WI-3: Shadow Mode Validation (HIGH)

**Dependencies**: WI-1
**Source**: EVALUATION rec #1 — shadow mode never actually ran

#### Description
Create integration tests that enable shadow mode and run the full test suite's compiled patches through 10+ frames each. Assert zero mismatches across all three evaluators (signal, event, materializer).

Use existing test fixtures and `compile()` to produce real programs. Execute frames with shadow mode enabled. Any mismatch is a test failure.

#### Acceptance Criteria
- [ ] Integration test compiles 3+ different patches (simple, multi-block, event-using)
- [ ] Runs each for 10+ frames with shadow signal enabled
- [ ] Runs each for 10+ frames with shadow event enabled
- [ ] Runs each for 10+ frames with shadow materializer enabled
- [ ] Zero mismatches across all runs
- [ ] If mismatches found, fix the evaluator bug (not the test)

---

### P0 WI-4: Cutover Mode Validation (HIGH)

**Dependencies**: WI-2, WI-3 (shadow must pass first)
**Source**: EVALUATION rec #2 — cutover mode never ran

#### Description
Run the full test suite with all three cutover flags enabled (valueExprSignal, valueExprEvent, valueExprMaterialize). All 2057+ tests must pass. This proves the ValueExpr evaluators can fully replace legacy.

#### Acceptance Criteria
- [ ] All tests pass with valueExprSignal = true
- [ ] All tests pass with valueExprEvent = true
- [ ] All tests pass with valueExprMaterialize = true
- [ ] All tests pass with ALL THREE enabled simultaneously
- [ ] No rendering differences in manual testing

---

### P1 WI-5: Cleanup (MEDIUM)

**Dependencies**: WI-4 (cutover validated)
**Source**: EVALUATION cleanup debt items

#### Description
After cutover is validated:
- Delete `lowerToValueExprs.test.ts.orig` leftover file
- Fix dummy CanonicalType construction in materializer (use expr.type directly)
- Remove defensive null checks on always-initialized cache arrays
- Replace reduce bridge in signal evaluator with direct ValueExpr materializer call (if materializer cutover is validated)

#### Acceptance Criteria
- [ ] No `.orig` files in repo
- [ ] No `as any` casts in ValueExprMaterializer for type construction
- [ ] Reduce bridge uses ValueExpr materializer (not legacy)
- [ ] TypeScript compiles, all tests pass

## Dependencies
- All 5 previous sprints must be complete (they are)

## Risks
- **Shadow mismatches**: If evaluators produce different results than legacy, debugging may be complex. Mitigation: start with simplest patches; mismatches will point to specific expression kinds.
- **Performance regression**: Cutover mode may be slower if evaluator dispatch is less optimized. Mitigation: measure before/after; optimize if >5% regression.
