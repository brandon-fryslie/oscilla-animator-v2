# Sprint: test-reenable - Re-enable Skipped Store Integration Tests
Generated: 2026-02-03-140000
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-02-03-131723.md

## Sprint Goal
Remove incorrect `.skip` from 3 Store Integration tests in composite-roundtrip.test.ts and verify they pass.

## Scope
**Deliverables:**
- 3 Store Integration tests re-enabled (no longer skipped)
- Incorrect circular dependency comments removed
- All tests passing locally

## Work Items

### P0 - Remove .skip from Store Integration tests [HIGH]

**Dependencies**: None
**Spec Reference**: CLAUDE.md "THERE IS NO SUCH THING AS PRE-EXISTING TEST FAILURES"
**Status Reference**: EVALUATION-2026-02-03-131723.md Section 3 ("The Skipped Tests Are Likely Valid Code")

#### Description
The `describe.skip('Store Integration', ...)` block at line 527 of `src/patch-dsl/__tests__/composite-roundtrip.test.ts` contains 3 tests that were incorrectly skipped. The skip comment claims "heap exhaustion due to circular dependency between blocks/registry -> compiler modules -> stores" but the evaluation proved this diagnosis is wrong: stores has zero imports from compiler and compiler has zero imports from stores. The tests use dynamic `await import()` and similar store tests in `stores/__tests__/integration.test.ts` pass fine.

This is a 2-line change: remove the comment block (lines 524-526) and change `describe.skip` to `describe` (line 527).

#### Acceptance Criteria
- [ ] `describe.skip('Store Integration', ...)` changed to `describe('Store Integration', ...)`
- [ ] Comment lines 524-526 (incorrect circular dependency explanation) removed
- [ ] All 3 Store Integration tests pass: `npx vitest run src/patch-dsl/__tests__/composite-roundtrip.test.ts`
- [ ] Full test suite still passes: `npm run test` (no regressions)
- [ ] No new test skips introduced

#### Technical Notes
- The tests already use dynamic `await import('../../stores/CompositeEditorStore')` to lazy-load the store, which is the correct pattern.
- If any test fails, it is a real bug that should be investigated and fixed, NOT re-skipped.
- The committed version (fa107a3) did not skip these tests -- the skip is only in uncommitted local changes.

## Dependencies
- None. This sprint is fully independent.

## Risks
- **Risk**: Tests might actually fail due to a real (non-circular-dependency) bug.
  **Mitigation**: If they fail, diagnose the actual failure. The evaluation confirms the circular dependency claim is wrong, but there could be a different issue. Do NOT re-skip.
  **Likelihood**: Low (similar store tests pass fine).
