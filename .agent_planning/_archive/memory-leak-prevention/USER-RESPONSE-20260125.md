# User Response: Memory Leak Prevention Plan

**Generated:** 2026-01-25
**Status:** PENDING APPROVAL

## Sprint Summary

| Sprint | Confidence | Status | Deliverables |
|--------|------------|--------|--------------|
| **1. immediate-leak-fix** | HIGH | READY | Fix subarray retention bug |
| **2. memory-instrumentation** | HIGH | READY | Add observability metrics |
| **3. invariant-guards** | MEDIUM | PARTIALLY READY | Debug-mode enforcement |
| **4. automated-leak-tests** | MEDIUM | PARTIALLY READY | CI regression tests |

## Recommended Execution Order

1. **Sprint 1 (immediate-leak-fix)** - Fix the active bug first
2. **Sprint 2 (memory-instrumentation)** - Add visibility to detect future leaks
3. **Sprint 4 (automated-leak-tests)** - Prevent regression
4. **Sprint 3 (invariant-guards)** - Additional debug tooling (optional)

## User Decision Points

### Q1: Approve Sprint 1 for immediate implementation?

Sprint 1 directly addresses the "substantial memory leak in the hot loop" by fixing the subarray view retention issue in `assembleDrawPathInstancesOp`.

**Options:**
- [ ] **APPROVE** - Proceed with implementation
- [ ] **MODIFY** - Request changes to the approach
- [ ] **DEFER** - Need more information

### Q2: Approve remaining sprints for sequential implementation?

**Options:**
- [ ] **APPROVE ALL** - Implement Sprints 2-4 after Sprint 1
- [ ] **APPROVE 2 ONLY** - Just instrumentation, skip guards/tests
- [ ] **APPROVE 2+4** - Instrumentation and tests, skip debug guards
- [ ] **DEFER** - Revisit after Sprint 1 is complete

---

## Approval Record

**Approved By:** User
**Date:** 2026-01-25
**Decision:** APPROVED Sprint 1 (immediate-leak-fix)
**Notes:** User approved immediate implementation. Fix applied to RenderAssembler.ts.

## Implementation Status

### Sprint 1: immediate-leak-fix - COMPLETE ✓

**Changes made:**
1. `src/runtime/RenderAssembler.ts:1195-1220` - Added buffer copy in single-group path
2. `src/runtime/RenderAssembler.ts:139-166` - Enhanced JSDoc warning on depthSortAndCompact

**Verification:**
- All 32 RenderAssembler tests pass
- Build compiles successfully
- Pattern now matches multi-group path (lines 830-838)

**Next Steps (when ready):**
- Sprint 2: Add memory instrumentation
- Sprint 3: Debug-mode invariant guards
- Sprint 4: Automated leak regression tests
