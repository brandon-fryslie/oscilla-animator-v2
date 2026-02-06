# Sprint: runtime-construct - Runtime construct() Support
Generated: 2026-02-06 15:00:00
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260206-143000.md

## Sprint Goal
Extend the runtime to handle `construct()` expressions in signal context, enabling multi-component signals (vec2, vec3, color) to be assembled from scalar components without stepSlotWriteStrided.

## Scope
**Deliverables:**
- construct() case in ValueExprSignalEvaluator that evaluates components and writes contiguously
- Removal of stride=1 restriction in ScheduleExecutor evalValue handler
- hslToRgb case in ValueExprSignalEvaluator (same pattern as construct)
- Tests for multi-component signal construction via construct()

## Work Items

### P0 - Extend ValueExprSignalEvaluator to handle construct()

**Dependencies**: None
**Spec Reference**: PURE-LOWERING-TODO.md "Decision: Construct is the canonical mechanism" / TYPE-SYSTEM-INVARIANTS.md rule 9 (only explicit ops change axes)
**Status Reference**: EVALUATION-20260206-143000.md "Critical Blocker: Runtime Does Not Support construct() in Signal Context"

#### Description
The `evaluateSignalExtent()` function in `ValueExprSignalEvaluator.ts` currently throws `'construct expressions are field-extent, not signal-extent'` at line 193. This must be replaced with a working implementation that:
1. Evaluates each component expression via recursive `evaluateValueExprSignal()` calls
2. Returns the first component value (for cache compatibility with the scalar return type)
3. Writes all component values into the target slot's strided storage

The challenge is that `evaluateValueExprSignal()` returns a single `number`, but construct() produces `stride` numbers. Two approaches:
- **Approach A (recommended)**: Add a new function `evaluateValueExprSignalStrided()` that writes directly to state, called from ScheduleExecutor for strided slots. The existing scalar function remains for stride=1.
- **Approach B**: Have construct() return the first component but also write all components as a side effect.

Approach A is cleaner because the evaluator's return type stays honest (single number for scalar, void for strided writes).

Similarly, the `hslToRgb` case (line 199) also throws. This needs the same treatment: evaluate the input construct, apply HSL-to-RGB conversion, and write the 4 RGBA components.

#### Acceptance Criteria
- [ ] `evaluateSignalExtent()` handles `case 'construct'` without throwing
- [ ] `evaluateSignalExtent()` handles `case 'hslToRgb'` without throwing
- [ ] Multi-component values (vec2=2, vec3=3, color=4 components) are written correctly to contiguous f64 slots
- [ ] Existing scalar signal evaluation is not affected (no regression)
- [ ] New tests pass for construct with vec2, vec3, and color payloads

#### Technical Notes
- The materializer (`ValueExprMaterializer.ts:96-108`) already has a working `construct` case for field-extent. The signal-extent version should mirror this pattern but write to `state.values.f64` instead of a Float32Array buffer.
- The evaluator currently returns `number`. For strided writes, we need either a separate entry point or a way to write multiple values. A separate `evaluateValueExprSignalStrided(veId, valueExprs, state, targetOffset, stride)` function is the cleanest approach.
- For hslToRgb: reuse the same conversion math already in `ValueExprMaterializer.ts:580-631`.

---

### P0 - Remove stride=1 restriction in ScheduleExecutor

**Dependencies**: construct() support in evaluator
**Spec Reference**: PURE-LOWERING-TODO.md "Make construct a first-class signal expression"
**Status Reference**: EVALUATION-20260206-143000.md "ScheduleExecutor.ts:249-250 -- if (stride !== 1) { throw new Error(...) }"

#### Description
In `ScheduleExecutor.ts:249-250`, the evalValue handler for ContinuousScalar/ContinuousField strategy throws when `stride !== 1`. This restriction must be relaxed so that multi-component signal slots can be written via the unified evalValue path.

When stride > 1 and the expression root is a `construct` or `hslToRgb` node:
1. Call the new strided evaluator function
2. Write all component values to the target slot at `offset`, `offset+1`, ... `offset+stride-1`
3. Record debug tap values for each component

The existing scalar path (stride === 1) should remain unchanged for performance.

#### Acceptance Criteria
- [ ] ScheduleExecutor handles evalValue with stride > 1 for construct/hslToRgb expression roots
- [ ] Scalar signals (stride=1) still use the fast scalar path (no regression)
- [ ] Debug tap records values for each component of a multi-component signal
- [ ] shape2d storage path is unaffected

#### Technical Notes
- The `slotWriteStrided` step kind (lines 286-312) already demonstrates how to evaluate components and write them to contiguous slots. The new construct-based path should produce identical runtime behavior.
- Strategy enum: `ContinuousScalar=0` implies stride=1, but `ContinuousField=1` may have stride>1 for signals. May need a new strategy value or simply check stride at runtime.
- Consider: should the schedule compiler emit ContinuousScalar for construct-rooted slots? If so, the stride check is the right place to dispatch.

---

### P1 - Tests for multi-component signal construction

**Dependencies**: Both items above
**Spec Reference**: N/A (testing)
**Status Reference**: EVALUATION-20260206-143000.md "Risks: Runtime changes may break existing tests"

#### Description
Add unit tests covering:
1. `evaluateValueExprSignalStrided()` with vec2 (2 components), vec3 (3 components), color (4 components)
2. ScheduleExecutor handling evalValue with stride > 1
3. End-to-end test: a Const block with vec2 value compiles and executes correctly

These tests should be added to the existing test file `src/runtime/__tests__/ValueExprSignalEvaluator.test.ts` and potentially a new integration test.

#### Acceptance Criteria
- [ ] Unit test: construct([const(1.0), const(2.0)], vec2) writes 1.0 and 2.0 to consecutive f64 slots
- [ ] Unit test: construct with 4 components (color) writes all 4 values correctly
- [ ] Unit test: hslToRgb on a construct of 4 HSL components produces correct RGB values
- [ ] Existing tests continue to pass (run full `npm run test`)

#### Technical Notes
- Follow the existing test pattern in `ValueExprSignalEvaluator.test.ts` which uses `createTestState()` helper and constructs ValueExpr arrays manually.
- The test at line 39 already demonstrates extract from strided slots; new tests should cover the write side.

## Dependencies
- None (this is the foundation sprint)

## Risks
- **Performance**: Adding stride checks to the hot eval path could impact frame rate. Mitigation: Branch on stride=1 first (fast path), only enter strided path for stride>1.
- **Cache coherence**: The signal evaluator caches by ValueExprId. A construct node caches as a single entry but writes multiple f64 values. Ensure caching doesn't skip the multi-component writes on cache hit.
