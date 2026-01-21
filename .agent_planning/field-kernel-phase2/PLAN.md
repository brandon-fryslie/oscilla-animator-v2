# Field Kernel Refactor Phase 2 - Planning Document

**Created:** 2026-01-21  
**Based on:** `.agent_planning/_future/7-field-kernel.md`  
**Prerequisite:** kernel-refactor-phase1 (Phases 1-7 complete)

## Executive Summary

The `7-field-kernel.md` document identified areas where Materializer.ts was doing "double-duty" - mixing IR orchestration with field kernel implementations. Phase 1 addressed the critical issues:

- ✅ Moved scalar math (sqrt/floor/ceil/round) to OpcodeInterpreter
- ✅ applyMap now only supports opcodes (throws for kernels)
- ✅ fieldGoldenAngle moved to applyKernel
- ✅ Layer contracts documented in KERNEL-CONTRACTS.md
- ✅ Coord-space agnostic documentation added
- ✅ Phase 7 sanity tests implemented

This Phase 2 addresses remaining refinements from the original recommendations.

## Current State Analysis

### What's Working Well

1. **Materializer.ts** (1100+ lines) correctly handles:
   - IR → buffer orchestration
   - Buffer cache management (frame-stamped)
   - Intrinsic field production (index, normalizedIndex, randomId)
   - Layout field production (position, radius)
   - Field kernel dispatch via applyKernel/applyKernelZipSig

2. **Layer Boundaries** are clear:
   - OpcodeInterpreter: scalar math only
   - SignalEvaluator: domain-specific scalar→scalar
   - Materializer: IR orchestration + field kernels

3. **kernel-signatures.ts** exists with TypeScript type annotations for unit validation

### Remaining Improvements (from 7-field-kernel.md)

#### 1. Naming Clarity (Low Priority)
The recommendation to rename `kernelName` → `fieldOp` improves clarity about what these functions do. Currently 21 uses of `kernelName` in Materializer.ts.

**Status:** Optional cosmetic improvement
**Risk:** Very low - only affects parameter names, not behavior

#### 2. Registry Comment Block (Low Priority)
Add explicit "Field kernels registry" comment block at the top of applyKernel to mirror the header documentation format.

**Status:** Documentation improvement
**Risk:** None

#### 3. Kernel Signatures Completeness (Medium Priority)
kernel-signatures.ts doesn't cover all field kernels. Missing signatures for:
- makeVec2
- hsvToRgb
- jitter2d / fieldJitter2D
- attract2d
- fieldRadiusSqrt
- fieldAdd
- applyOpacity
- polygonVertex
- starVertex

**Status:** Improves type safety and documentation
**Risk:** Very low

#### 4. Extract Field Kernels to Separate Module (Future/Optional)
The recommendation suggested field kernels could be extracted to a separate file for clarity. This is optional - the current organization is functional.

**Status:** Optional architectural improvement
**Risk:** Low - purely structural refactor

## Recommended Work Items

### Sprint 1: Complete Kernel Signatures (P2)
Add missing kernel signatures to kernel-signatures.ts for all field kernels.

**Files:** `src/runtime/kernel-signatures.ts`
**Effort:** 1-2 hours
**Value:** Improved documentation, enables future validation

### Sprint 2: Naming Refinement (P3)
Rename `kernelName` → `fieldOp` in applyKernel and applyKernelZipSig for clarity.

**Files:** `src/runtime/Materializer.ts`
**Effort:** 30 minutes
**Value:** Code clarity

### Sprint 3: Registry Comments (P3)
Add explicit registry comment block at top of applyKernel section.

**Files:** `src/runtime/Materializer.ts`
**Effort:** 15 minutes
**Value:** Documentation

### Future: Extract Field Kernels (P4)
Create `src/runtime/FieldKernels.ts` and move kernel implementations there.

**Files:** `src/runtime/FieldKernels.ts`, `src/runtime/Materializer.ts`
**Effort:** 2-3 hours
**Value:** Cleaner separation of concerns

## Priority Assessment

| Sprint | Priority | Effort | Value | Recommendation |
|--------|----------|--------|-------|----------------|
| 1: Signatures | P2 | 1-2h | High | Do now |
| 2: Naming | P3 | 30m | Medium | Optional |
| 3: Comments | P3 | 15m | Low | Optional |
| 4: Extract | P4 | 2-3h | Medium | Future |

## Definition of Done

For each sprint:
1. ✅ Implementation complete
2. ✅ Existing tests still pass (544+ tests)
3. ✅ `pnpm build` succeeds
4. ✅ Documentation updated if applicable
5. ✅ No regressions in runtime behavior

## Verification

After Phase 2:
- All field kernels have signatures in kernel-signatures.ts
- Parameter naming is consistent (optional)
- Documentation is complete (optional)
- Architecture diagram in KERNEL-CONTRACTS.md remains accurate
