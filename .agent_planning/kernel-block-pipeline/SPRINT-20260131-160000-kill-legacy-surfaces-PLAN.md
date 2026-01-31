# Sprint: kill-legacy-surfaces — Kill Legacy Evaluation Surfaces
Generated: 2026-01-31-160000 (Updated after review)
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Eliminate all non-test entrypoints to legacy evaluator code and add enforcement that legacy code never executes in production. Add runtime validation that RenderAssembler only reads slots written this frame.

## Scope
**Deliverables:**
1. RenderAssembler reads from slot cache instead of calling `evaluateSignal()`
2. Schedule-order assertion: slots written before read
3. Tripwire enforcement (static + runtime)
4. Dead legacy code deletion (EventEvaluator, Materializer, SignalEvaluator)

## Work Items

### WI-1: Remove evaluateSignal() from RenderAssembler [HIGH]

**Current state**: `RenderAssembler.ts` imports `evaluateSignal` (line 21) and calls it at:
- Line 428: `evaluateSignal(scaleSpec.id, signals, state)` — resolve scale signal
- Line 470: `evaluateSignal(paramSignals[i], signals, state)` — resolve shape params

**Fix**: These signals are already evaluated during Phase 1 of `executeFrame()` and their values are in `state.signalSlots`. The RenderAssembler should read from `state.signalSlots[slotIndex]` instead of re-evaluating.

**Implementation path**:
1. Find how `scaleSpec.id` and `paramSignals[i]` map to slot indices (they're `SigExprId` — check the schedule/program for slot mappings)
2. Replace `evaluateSignal(id, signals, state)` with slot reads
3. Remove the `evaluateSignal` import
4. Remove `signals` parameter from `assembleRenderFrame()` if no longer needed

**Acceptance Criteria:**
- [ ] `RenderAssembler.ts` has no import of `evaluateSignal` or `SignalEvaluator`
- [ ] `assembleRenderFrame()` signature no longer requires legacy signal data structures
- [ ] All existing tests pass unchanged (behavior preserved)
- [ ] Visual output unchanged (run dev server, compare render)

**Technical Notes:**
- The program's `schedule.steps` have `evalSig` entries that map SigExprId → slot index. The slot values are in `state.signalSlots` (Float64Array).
- If the SigExprId→slot mapping isn't readily available in the program, check `program.slotMap` or equivalent.
- The ValueExpr table has `sigToValue` mapping — may need to look up slot via schedule step.

### WI-2: Add schedule-order assertion for slot reads [HIGH]

**Purpose**: Enforce that RenderAssembler never reads a slot that wasn't written this frame. This catches ordering bugs and accidental reads of stale data.

**Implementation**:
- Add a DEV-mode stamp array: `state.slotWriteFrame: Uint32Array` (length = slot count)
- In ScheduleExecutor, after each `evalSig` or `slotWriteStrided` step, stamp `state.slotWriteFrame[slotIndex] = state.currentFrame`
- In RenderAssembler (or add a wrapper), before reading `state.signalSlots[index]`, assert:
  ```typescript
  if (DEV_MODE && state.slotWriteFrame[index] !== state.currentFrame) {
    throw new Error(`Slot ${index} read before write in frame ${state.currentFrame}`);
  }
  ```

**Acceptance Criteria:**
- [ ] `state.slotWriteFrame` array exists (DEV-mode only, or always with conditional checks)
- [ ] Assertion fires if RenderAssembler reads a slot not written this frame
- [ ] Test that deliberately violates ordering triggers the assertion
- [ ] No performance impact in production builds (assertion compiled out or behind flag)

**Technical Notes:**
- This is a safety net for WI-1. If the slot mapping is wrong, or if a signal isn't in the schedule, this will catch it immediately.
- Could also be implemented as a debug hook in a slot read helper function.

### WI-3: Add tripwire enforcement (static + runtime) [HIGH]

**Purpose**: Enforce that legacy evaluator code never runs. Catch regressions from re-export chains or accidental imports.

**Static tripwire** (grep-based test):
- Test file: `src/runtime/__tests__/no-legacy-evaluator.test.ts`
- Check: no file in `src/runtime/` (excluding `__tests__/`) imports from `SignalEvaluator`, `EventEvaluator`, or `Materializer`

**Runtime tripwire** (module-level enforcement):
- In each legacy evaluator file, add at module top-level:
  ```typescript
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Legacy evaluator module loaded in non-test build. ' +
      'This indicates an accidental import or re-export. ' +
      'Check import chains and ensure runtime/ only uses ValueExpr evaluators.'
    );
  }
  ```
- Or: export only a stub function that throws (if module-level throw causes issues with bundlers)

**Acceptance Criteria:**
- [ ] Static test exists and runs in `npm run test`
- [ ] Static test fails if someone adds a legacy evaluator import to production code
- [ ] Runtime tripwire throws if legacy module is imported in non-test builds
- [ ] Test documents its purpose (architectural enforcement comment)
- [ ] Legacy modules can still be imported in test files (for migration testing)

**Technical Notes:**
- The runtime tripwire is insurance against re-exports. For example, if `src/runtime/index.ts` accidentally re-exports `evaluateSignal`, and some other module imports from there, the static test might miss it but the runtime tripwire will catch it at module load.

### WI-4: Delete dead legacy evaluator files [HIGH]

**Files to delete** (after WI-1, WI-2, WI-3 are verified):
- `src/runtime/SignalEvaluator.ts` — Legacy signal evaluator
- `src/runtime/EventEvaluator.ts` — Legacy event evaluator
- `src/runtime/Materializer.ts` — Legacy materializer

**After deletion:**
- Remove from `src/runtime/index.ts` exports
- Remove from any test imports (update tests to use ValueExpr evaluators or delete if legacy-specific)
- Remove any remaining imports across codebase

**Acceptance Criteria:**
- [ ] No files named `SignalEvaluator.ts`, `EventEvaluator.ts`, or `Materializer.ts` in `src/runtime/`
- [ ] No imports of `evaluateSignal`, `evaluateEvent` (legacy), or `materialize` (legacy) anywhere in `src/`
- [ ] `npm run build` passes
- [ ] `npm run test` passes with no new failures

**Technical Notes:**
- WI-3's tripwires must be in place and passing before deleting. If they aren't, deletion might succeed but break at runtime in unexpected ways.

## Dependencies
- WI-2 can run in parallel with WI-1
- WI-3 should run before WI-4 (validate enforcement before deletion)
- WI-4 depends on WI-1 (can't delete SignalEvaluator until RenderAssembler doesn't use it)

## Risks
- **RenderAssembler slot read**: If the signal values aren't already in slots when RenderAssembler runs, we'd need to ensure ordering. Mitigation: RenderAssembler runs AFTER Phase 1 of executeFrame, so all evalSig steps have run. WI-2's assertion will catch any violations.
- **Test breakage**: Some tests may import legacy evaluators directly. Mitigation: Update those tests to use ValueExpr evaluators or delete them if they're testing legacy behavior. WI-3's runtime tripwire allows test imports (via `NODE_ENV` check).
- **Re-export chains**: Static grep may miss legacy symbols re-exported through intermediate modules. Mitigation: WI-3's runtime tripwire catches this at module load time.
