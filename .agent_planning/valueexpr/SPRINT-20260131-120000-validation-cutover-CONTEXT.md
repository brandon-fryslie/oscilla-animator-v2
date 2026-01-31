# Implementation Context: validation-cutover

Generated: 2026-01-31-120000

## Key Files

### To Modify
- `src/runtime/ScheduleExecutor.ts` — Replace 6 hardcoded const flags with EvalMode config; add event cutover path
- `src/runtime/ValueExprSignalEvaluator.ts` — Replace reduce bridge with direct materializer call (WI-5)
- `src/runtime/ValueExprMaterializer.ts` — Fix dummy CanonicalType construction (WI-5)

### To Create
- `src/runtime/__tests__/valueexpr-shadow-validation.test.ts` — Shadow mode integration tests
- `src/runtime/__tests__/valueexpr-cutover-validation.test.ts` — Cutover mode integration tests

### To Delete
- `src/compiler/ir/__tests__/lowerToValueExprs.test.ts.orig` — Leftover file

### Reference (read, don't modify)
- `src/runtime/SignalEvaluator.ts` — Legacy signal evaluator (shadow comparison target)
- `src/runtime/EventEvaluator.ts` — Legacy event evaluator
- `src/runtime/Materializer.ts` — Legacy materializer
- `src/runtime/RuntimeState.ts` — Cache structure

## Current Flag Locations (to replace)
- Line 45: `const SHADOW_EVAL = false`
- Line 59: `const VALUE_EXPR_ONLY = false`
- Line 73: `const SHADOW_MATERIALIZE = false`
- Line 87: `const VALUE_EXPR_MATERIALIZE = false`
- (Shadow event reuses SHADOW_EVAL flag at ~line 714)
- (No event cutover flag exists)

## EvalMode Design
```typescript
interface EvalMode {
  shadowSignal: boolean;      // Shadow compare signal evaluation
  shadowEvent: boolean;       // Shadow compare event evaluation
  shadowMaterialize: boolean; // Shadow compare field materialization
  valueExprSignal: boolean;   // Use ValueExpr-only for signals
  valueExprEvent: boolean;    // Use ValueExpr-only for events
  valueExprMaterialize: boolean; // Use ValueExpr-only for materialization
}
```

Attach to RuntimeState or pass as parameter to executeFrame(). Tests create custom EvalMode; production uses all-false default.

## Shadow Validation Strategy
1. Compile real patches using existing test helpers or `compile()` directly
2. Create RuntimeState with shadow flags enabled
3. Execute 10+ frames
4. Shadow mode comparisons happen inside ScheduleExecutor — mismatches throw or log
5. For tests: make mismatches throw (not just log) so tests fail on divergence

## Test Patches to Use
- Simple: single oscillator → renderer
- Multi-block: LFO → math → renderer
- Events: phasor wrap → event → state change
- Fields: instance array with broadcast/map/zip
