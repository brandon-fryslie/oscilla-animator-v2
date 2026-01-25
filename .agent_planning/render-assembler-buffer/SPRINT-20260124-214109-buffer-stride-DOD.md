# Definition of Done: buffer-stride
Generated: 2026-01-24-214109
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260124-214109-buffer-stride-PLAN.md

## Acceptance Criteria

### RenderAssembler.test.ts Update
- [ ] Line 231 no longer uses `.toBe()` reference equality check
- [ ] Position buffer verified as Float32Array instance
- [ ] Position buffer has correct length (4 floats for 2 instances x stride-2)
- [ ] Position values verified as finite numbers in expected range
- [ ] Test passes: `npm test RenderAssembler.test.ts`

### RenderAssembler-per-instance-shapes.test.ts Update
- [ ] Lines 433-436 expect stride-2 circle positions: `[0.1, 0.1, 0.4, 0.4]` (4 floats)
- [ ] Lines 444-447 expect stride-2 square positions: `[0.2, 0.2, 0.3, 0.3]` (4 floats)
- [ ] All z values removed from expected arrays
- [ ] Test passes: `npm test RenderAssembler-per-instance-shapes.test.ts`

### level1-vec3-data.test.ts Update
- [ ] Line 233 expects `N * 2` length (32 floats, not 48)
- [ ] Comment at line 231 updated to document stride-2 projected output
- [ ] Validation loop (lines 236-242) iterates by stride-2
- [ ] Only x,y values checked for finiteness (z no longer exists)
- [ ] Test passes: `npm test level1-vec3-data.test.ts`

## Verification Commands

```bash
# Individual test verification
npm test -- --testPathPattern="RenderAssembler.test.ts" --no-coverage
npm test -- --testPathPattern="RenderAssembler-per-instance-shapes.test.ts" --no-coverage
npm test -- --testPathPattern="level1-vec3-data.test.ts" --no-coverage

# All three together
npm test -- --testPathPattern="(RenderAssembler|level1-vec3-data)" --no-coverage

# Full test suite (ensure no regressions)
npm test
```

## Completion Criteria

Sprint is complete when:
1. All three test files updated
2. All individual tests pass
3. Full test suite passes with no new failures
4. No changes to implementation code (tests only)
