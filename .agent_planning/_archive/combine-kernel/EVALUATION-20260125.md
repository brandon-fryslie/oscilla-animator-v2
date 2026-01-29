# Evaluation: combine-kernel

**Generated:** 2026-01-25
**Topic:** Fix missing combine_* signal kernels
**Verdict:** CONTINUE

## Problem Statement

Runtime error occurring during animation playback:
```
[22:56:08] Runtime error: Error: Unknown signal kernel: combine_last
```

## Root Cause Analysis

**Confirmed:** The `IRBuilderImpl.sigCombine()` method (line 173) generates kernel names using:
```typescript
const fn: PureFn = { kind: 'kernel', name: `combine_${mode}` };
```

This produces kernels: `combine_sum`, `combine_average`, `combine_max`, `combine_min`, `combine_last`

**Confirmed:** The `SignalEvaluator.applySignalKernel()` function has no handlers for any `combine_*` kernels. The switch statement falls through to default (line 467), throwing "Unknown signal kernel".

## Scope Assessment

**Files Affected:** 1 file
- `src/runtime/SignalEvaluator.ts`

**Complexity:** LOW
- Straightforward addition of switch cases
- Clear semantics for each combine mode
- No architectural changes required

## Risk Assessment

**Risk Level:** LOW
- Pure addition, no modification of existing behavior
- Well-defined semantics from combine modes
- Testable in isolation

## Dependencies

None - this is a self-contained fix.

## Verdict: CONTINUE

This is a straightforward bug fix with:
- Clear root cause
- Known solution
- Single file change
- Low risk
