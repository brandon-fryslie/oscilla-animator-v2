# Sprint Findings: test-reenable (BLOCKED)
Generated: 2026-02-03
Status: BLOCKED - Cannot proceed
Sprint: SPRINT-2026-02-03-140000-test-reenable

## Executive Summary

**The sprint cannot proceed as planned.** The evaluation (EVALUATION-2026-02-03-131723.md) was based on incorrect information. The Store Integration tests are **already re-enabled** in the current codebase (no `.skip`), and they **genuinely fail with heap exhaustion**. The premise that "tests were incorrectly skipped" is false.

## Discovery

### Initial State (Before Any Changes)
- File: `src/patch-dsl/__tests__/composite-roundtrip.test.ts`
- Git status: `M` (modified, uncommitted)
- Actual uncommitted change: ONE LINE adding a comment `// Dynamically import to avoid circular dependency during module initialization`
- Test status: `describe('Store Integration', ...)` (NO `.skip`)

### Evaluation Claimed
- Evaluation claimed there was a `describe.skip` on line 527
- Evaluation claimed there were comment lines 524-526 with circular dependency misdiagnosis
- Evaluation recommended removing `.skip` and running tests

### Reality
- NO `.skip` exists in current working directory or in HEAD
- NO comment block lines 524-526 exists
- Tests ARE currently active (not skipped)
- Tests FAIL with heap exhaustion when run

## Test Failure Evidence

### Command
```bash
npx vitest run src/patch-dsl/__tests__/composite-roundtrip.test.ts
```

### Result
- Exit code: 1
- Error: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`
- Tests passed: 27 (the non-Store Integration tests)
- Tests skipped: 0
- Worker exit: Unexpected (during test collection phase, not execution)

### Heap Size Test
Tried with increased heap:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npx vitest run src/patch-dsl/__tests__/composite-roundtrip.test.ts
```

Result: Still failed with `Fatal JavaScript invalid size error 169220804`

## Analysis

### The Problem is Real
The heap exhaustion occurs during the **test collection phase** (module initialization), not during test execution. This suggests:
1. The dynamic `await import('../../stores/CompositeEditorStore')` is NOT preventing the issue
2. Something about loading CompositeEditorStore during test file initialization causes infinite array growth
3. This is likely a real circular dependency or infinite recursion during module initialization

### The Evaluation Was Based on Wrong Data
The evaluation document states:
- "Status": MISDIAGNOSED
- "Evidence": `src/patch-dsl/__tests__/composite-roundtrip.test.ts:524-526` (local uncommitted change)
- "The comment claims: `blocks/registry -> compiler modules -> stores`"

But in reality:
- Lines 524-526 do NOT contain any such comment in the current state
- The only uncommitted change was a single comment line (unrelated to skipping)
- The `.skip` does NOT exist

### Hypothesis: Past State vs Current State
The evaluation may have been based on a **past version** of the file where tests were skipped. Possibly:
1. At some point, tests were skipped with a comment about circular dependencies
2. Later, someone removed the `.skip` without fixing the underlying issue
3. The evaluation looked at an old git diff or stale planning document
4. Current state: tests are active but failing

## Impact on Sprint

### Cannot Complete Acceptance Criteria
From DOD:
- [ ] `describe.skip` on line 527 changed to `describe` (no `.skip`) — **ALREADY NO .skip**
- [ ] Comment block on lines 524-526 deleted entirely — **NO SUCH COMMENT EXISTS**
- [ ] `npx vitest run src/patch-dsl/__tests__/composite-roundtrip.test.ts` passes with 30 tests, 0 skipped — **FAILS WITH HEAP EXHAUSTION**

### The Real Issue
These tests genuinely cause heap exhaustion. They are NOT incorrectly skipped - they are correctly re-enabled but broken. The work item should be:
- **Diagnose and fix the heap exhaustion issue**, not just "remove .skip"

## Recommendations

1. **PAUSE this sprint** - the premise is wrong
2. **Investigate the heap exhaustion** - this is a real bug, not a misdiagnosed skip
3. **Update evaluation** - document that the evaluation was based on stale/incorrect file state
4. **New sprint needed** - "Fix Store Integration Test Heap Exhaustion" (diagnostic + fix work)

## Questions for User

1. Was there a previous version where tests were skipped? When was `.skip` removed?
2. Are these tests expected to work? Have they ever passed?
3. Should we investigate the heap exhaustion or leave tests disabled?
4. Is the CompositeEditorStore known to have initialization issues?

## Status

- Sprint: **BLOCKED** (cannot proceed)
- Issue: Real heap exhaustion bug discovered
- Action: Awaiting user direction
