# Definition of Done: runtime-construct
Generated: 2026-02-06 15:00:00
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260206-150000-runtime-construct-PLAN.md

## Acceptance Criteria

### Extend ValueExprSignalEvaluator to handle construct()
- [ ] `evaluateSignalExtent()` handles `case 'construct'` without throwing
- [ ] `evaluateSignalExtent()` handles `case 'hslToRgb'` without throwing
- [ ] Multi-component values (vec2=2, vec3=3, color=4) are written correctly to contiguous f64 slots
- [ ] Existing scalar signal evaluation is not affected (no regression)
- [ ] New tests pass for construct with vec2, vec3, and color payloads

### Remove stride=1 restriction in ScheduleExecutor
- [ ] ScheduleExecutor handles evalValue with stride > 1 for construct/hslToRgb expression roots
- [ ] Scalar signals (stride=1) still use the fast scalar path (no regression)
- [ ] Debug tap records values for each component of a multi-component signal
- [ ] shape2d storage path is unaffected

### Tests for multi-component signal construction
- [ ] Unit test: construct([const(1.0), const(2.0)], vec2) writes 1.0 and 2.0 to consecutive f64 slots
- [ ] Unit test: construct with 4 components (color) writes all 4 values correctly
- [ ] Unit test: hslToRgb on a construct of 4 HSL components produces correct RGB values
- [ ] Existing tests continue to pass (`npm run test` green)

## Verification
- [ ] `npm run test` passes with no new failures
- [ ] `npm run typecheck` passes
