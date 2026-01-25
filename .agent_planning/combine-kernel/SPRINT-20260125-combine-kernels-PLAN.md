# Sprint: combine-kernels - Add Missing Signal Combine Kernels

**Generated:** 2026-01-25
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Fix runtime error "Unknown signal kernel: combine_last" by adding missing combine kernel handlers to SignalEvaluator.

## Scope

**Deliverables:**
- Add `combine_sum`, `combine_average`, `combine_max`, `combine_min`, `combine_last` kernel handlers

## Work Items

### P0: Add combine kernel handlers to SignalEvaluator [HIGH]

**Acceptance Criteria:**
- [ ] `combine_sum` kernel returns sum of all input values
- [ ] `combine_average` kernel returns arithmetic mean of input values
- [ ] `combine_max` kernel returns maximum of input values
- [ ] `combine_min` kernel returns minimum of input values
- [ ] `combine_last` kernel returns the last input value
- [ ] Empty inputs handled gracefully (identity values)
- [ ] No runtime errors for combine_* kernels

**Technical Notes:**
- Add cases in `applySignalKernel()` switch statement (before default case at line 466)
- Location: `src/runtime/SignalEvaluator.ts`
- Empty array handling:
  - `sum` → 0
  - `average` → 0
  - `max` → -Infinity
  - `min` → Infinity
  - `last` → 0

## Dependencies

None.

## Risks

None identified - straightforward addition with no side effects.
