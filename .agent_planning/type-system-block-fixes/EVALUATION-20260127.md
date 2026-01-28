# Evaluation: Type System and Block Architecture Fixes

Timestamp: 2026-01-27-193000
Git Commit: 5d3af13

## Executive Summary

Overall: 85% complete | Critical issues: 4 TypeScript errors | Tests reliable: yes (1907 passing)

The codebase is in good shape with all tests passing but has 4 TypeScript compilation errors that prevent a clean build. These are localized issues in the diagnostics system that can be fixed quickly.

## Runtime Check Results

| Check | Status | Output |
|-------|--------|--------|
| TypeScript typecheck | FAILED | 4 errors in 3 files |
| Vitest test suite | PASSED | 1907 tests pass, 8 skipped |
| canonical-address tests | PASSED | 43 tests pass |

## TypeScript Errors (Must Fix)

### 1. DiagnosticHub.ts - DiagnosticFilter Type Mismatch

**File**: `/Users/bmf/code/oscilla-animator-v2/src/diagnostics/DiagnosticHub.ts`
**Lines**: 440, 450

**Issue**: The `DiagnosticFilter` interface expects arrays for `severity` and `domain` fields:
```typescript
// In types.ts line 254-261:
export interface DiagnosticFilter {
  readonly severity?: readonly Severity[];  // ARRAY expected
  readonly domain?: readonly Domain[];      // ARRAY expected
  ...
}
```

But the code passes single values:
```typescript
// Line 440:
return this.filter(this.getActive(), { severity });  // Single value passed
// Line 450:
return this.filter(this.getActive(), { domain });    // Single value passed
```

**Fix**: Wrap single values in arrays:
```typescript
return this.filter(this.getActive(), { severity: [severity] });
return this.filter(this.getActive(), { domain: [domain] });
```

### 2. HealthMonitor.ts - Missing createDiagnostic Import

**File**: `/Users/bmf/code/oscilla-animator-v2/src/runtime/HealthMonitor.ts`
**Lines**: 316, 336, 351

**Issue**: The import is commented out on line 21:
```typescript
// import { createDiagnostic } from '../diagnostics/types';
```

But `createDiagnostic` is used at lines 316, 336, 351.

**Investigation**: Grepping the codebase shows `createDiagnostic` is NOT exported from anywhere. This function needs to be:
1. Created and exported from `src/diagnostics/types.ts`, OR
2. Replaced with inline object construction

Looking at the usage, it appears to just be a helper that constructs a Diagnostic object. The code at lines 316-327 shows:
```typescript
const diag = createDiagnostic({
  code: 'P_NAN_DETECTED',
  severity: 'warn',
  domain: 'perf',
  primaryTarget: target,
  title: 'NaN value detected',
  message: `Signal produced NaN...`,
  scope: { patchRevision: activePatchRevision },
});
```

**Fix Options**:
1. Create and export `createDiagnostic` helper in types.ts
2. Inline the object construction with explicit `Diagnostic` type

### 3. DiagnosticsStore.ts - Same DiagnosticFilter Issue

**File**: `/Users/bmf/code/oscilla-animator-v2/src/stores/DiagnosticsStore.ts`
**Line**: 288

**Issue**: Same as DiagnosticHub.ts - passing single `'warn'` string where array expected:
```typescript
return this.filter({ severity: 'warn' });  // Should be ['warn']
```

## Missing Checks

None required - the existing type system and test suite adequately cover these areas.

## Findings

### Build System
**Status**: PARTIAL
**Evidence**: 4 TypeScript errors prevent clean build
**Issues**:
- DiagnosticFilter API inconsistency (expects arrays, sometimes receives singles)
- Missing createDiagnostic function

### Type System - Cardinality Diagnostics
**Status**: COMPLETE
**Evidence**:
- `E_CARDINALITY_MISMATCH` diagnostic code exists in `src/diagnostics/types.ts:100`
- Mapping exists in `src/compiler/diagnosticConversion.ts:92`
- Tests exist in `src/diagnostics/__tests__/cardinality-diagnostics.test.ts`
**Issues**: None - cardinality is properly surfaced in error messages

### Block System - Expression Block
**Status**: COMPLETE
**Evidence**: `src/blocks/expression-blocks.ts` fully implements:
- Unified varargs system (lines 14-23)
- Single code path for all inputs (lines 183-192)
- Proper cardinality declaration (lines 43-47)
- Expression DSL integration (lines 194-211)
**Issues**: None

### Adapter System (now Lenses)
**Status**: IN PROGRESS (see adapter-system-improvement topic)
**Evidence**:
- `AdapterAddress` was renamed to `LensAddress` in `src/types/canonical-address.ts:85`
- Sprint 1 completed per STATUS.md
- Exports are correct - `LensAddress` exported from `src/types/index.ts:397`
**Issues**: This is a separate topic with its own planning files

### Canonical Address Tests
**Status**: COMPLETE
**Evidence**: All 43 tests pass for canonical-address.test.ts
**Issues**: None - contrary to the task description, there are no test failures

## Ambiguities Found

| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| DiagnosticFilter API | Should filter accept single or array? | Types say array, implementation passes single | Low - easy fix |
| createDiagnostic | Is this a helper or was it accidentally removed? | Import commented out suggests intentional removal | Medium - need to decide approach |

## Recommendations

1. **Fix DiagnosticHub.ts type errors** (5 min)
   - Wrap single values in arrays at lines 440, 450

2. **Fix DiagnosticsStore.ts type error** (2 min)
   - Change line 288: `{ severity: 'warn' }` to `{ severity: ['warn'] }`

3. **Resolve createDiagnostic in HealthMonitor.ts** (10 min)
   - Option A: Create and export the helper function
   - Option B: Inline the Diagnostic construction
   - Recommend Option A for consistency with the existing call pattern

## Verdict

- [x] CONTINUE - Issues clear, implementer can fix

All 4 TypeScript errors are straightforward fixes:
- 2 are simple array wrapping in DiagnosticHub.ts
- 1 is array wrapping in DiagnosticsStore.ts
- 1 requires creating a helper function (or inlining) in HealthMonitor.ts

No clarification needed. The "canonical-address test failures" mentioned in the task do not exist - all 43 tests pass. The "AdapterAddress exports missing" issue is resolved - it was renamed to LensAddress and is properly exported.

---

```
EVALUATOR-CHECK: project-evaluator complete
  Scope: type-system-block-fixes | Completion: 85% | Gaps: 4 TypeScript errors
  Workflow: CONTINUE
  -> Fix 4 TypeScript errors in diagnostics/DiagnosticHub.ts, runtime/HealthMonitor.ts, stores/DiagnosticsStore.ts
```
