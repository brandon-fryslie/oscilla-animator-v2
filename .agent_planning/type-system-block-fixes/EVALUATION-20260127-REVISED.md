# Revised Evaluation: Type System and Block Architecture Fixes

**Timestamp**: 2026-01-27-195000
**Git Commit**: 5d3af13

## Executive Summary

**Critical Finding**: Many issues documented in the recap were INCORRECT or ALREADY FIXED:

| Originally Reported | Actual Status |
|---------------------|---------------|
| PathField missing arcLength | ✅ IMPLEMENTED - Full test coverage |
| PathField missing tangent | ✅ IMPLEMENTED - Full test coverage |
| SetZ doesn't accept fields | ✅ CARDINALITY-GENERIC - handles mixed inputs |
| Expression block wiring mystery | ✅ COMPLETE - Unified varargs system |
| canonical-address tests failing | ✅ ALL 43 TESTS PASS |
| AdapterAddress missing export | ✅ Renamed to LensAddress, properly exported |
| E_CARDINALITY_MISMATCH missing | ✅ EXISTS - with diagnostics + conversion |

**Actual Issues Remaining**:
1. **4 TypeScript compilation errors** (blocking build)
2. **localStorage caching issue** (dev experience)
3. **Stroke rendering** (feature gap)
4. **path-field-demo.ts** (may need debugging - demo not tested)

---

## Runtime Check Results

| Check | Status | Details |
|-------|--------|---------|
| TypeScript typecheck | ❌ FAILED | 4 errors in 3 files |
| Vitest test suite | ✅ PASSED | 1907 tests, 8 skipped |
| canonical-address tests | ✅ PASSED | 43 tests pass |
| PathField tests | ✅ PASSED | 13 tests pass |
| Cardinality diagnostics | ✅ EXISTS | E_CARDINALITY_MISMATCH wired through |

---

## TypeScript Errors (Must Fix - Sprint 1)

### 1. DiagnosticHub.ts - DiagnosticFilter Type Mismatch
**File**: `src/diagnostics/DiagnosticHub.ts`
**Lines**: 440, 450

**Fix**: Change single values to arrays:
```typescript
// Line 440:
return this.filter(this.getActive(), { severity: [severity] });
// Line 450:
return this.filter(this.getActive(), { domain: [domain] });
```

### 2. HealthMonitor.ts - Missing createDiagnostic
**File**: `src/runtime/HealthMonitor.ts`
**Lines**: 316, 336, 351

**Fix Option A** (Recommended): Create and export helper in `src/diagnostics/types.ts`
**Fix Option B**: Inline Diagnostic object construction

### 3. DiagnosticsStore.ts - Same Filter Issue
**File**: `src/stores/DiagnosticsStore.ts`
**Line**: 288

**Fix**:
```typescript
return this.filter({ severity: ['warn'] });
```

---

## Tickets That Can Be CLOSED (Already Fixed)

Based on investigation, these tickets created earlier describe issues that don't exist:

| Ticket ID | Title | Actual Status |
|-----------|-------|---------------|
| oscilla-animator-v2-13ku | Investigate Expression block wiring context issue | NOT A BUG - Expression block is complete |
| oscilla-animator-v2-b8qn | Implement PathField tangent and arcLength outputs | ALREADY IMPLEMENTED |
| oscilla-animator-v2-87k8 | Improve error messages for field/signal type mismatches | E_CARDINALITY_MISMATCH exists |

---

## Tickets That Remain Valid

| Ticket ID | Title | Status | Sprint |
|-----------|-------|--------|--------|
| oscilla-animator-v2-0t1n | Fix TypeScript build errors | VALID | 1 |
| oscilla-animator-v2-mhyi | Fix localStorage caching | VALID | 2 |
| oscilla-animator-v2-mizl | Implement stroke rendering | VALID | 3 |
| oscilla-animator-v2-ouo | Fix path-field-demo compile errors | NEEDS INVESTIGATION | 1 |
| oscilla-animator-v2-5s8 | Implement multi-component signal swizzle | VALID | 3 |

---

## path-field-demo.ts Investigation Needed

The demo uses:
- `PathField.arcLength` → ✅ Exists, returns Field<float>
- `SetZ.z` → ✅ Accepts Field<float> (cardinality-generic)
- `Multiply.a/b` → Needs check

If the demo is failing, the issue is likely:
1. Runtime error, not compile-time
2. Missing kernel implementation for a specific combination
3. HMR/localStorage caching (stale patch)

**Recommendation**: Run demo in browser, check console errors.

---

## Revised Sprint Plan

### Sprint 1: Build Fix (HIGH Confidence)
- Fix 4 TypeScript errors
- Test path-field-demo.ts in browser
- Close invalid tickets

### Sprint 2: Dev Experience (MEDIUM Confidence)
- Fix localStorage caching
- Add HMR invalidation for demo patches

### Sprint 3: Features (MEDIUM Confidence)
- Implement stroke rendering in RenderAssembler
- Multi-component signal swizzle (if needed)

---

## Verdict

- [x] CONTINUE

The scope is much smaller than originally thought. Most "issues" were based on incorrect recap information. The actual work is:
1. 4 small TypeScript fixes
2. Demo debugging (may be nothing)
3. 1-2 actual feature gaps (stroke rendering, maybe swizzle)
