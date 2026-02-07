# User Response: Opcode Consolidation

**Date:** 2026-02-06
**Status:** APPROVED
**Action:** Implemented

## Approved Sprint

- SPRINT-20260206-opcode-consolidation-PLAN.md

## Implementation Complete

### Changes Made

1. **ValueExprMaterializer.ts** (lines 393-434)
   - Replaced 48-line duplicate opcode switch with 25-line delegation
   - Now calls `applyOpcode()` for all opcode operations
   - Added handling for `kernelResolved` and `composed` PureFn kinds
   - Added exhaustive switch with never pattern

2. **forbidden-patterns.test.ts**
   - Added "Opcode Single Enforcer" test section
   - Tests that ValueExprMaterializer contains no inline opcode cases
   - Covers all 26 opcodes: add, sub, mul, div, mod, pow, sin, cos, tan, floor, ceil, round, sqrt, exp, log, min, max, clamp, lerp, select, wrap01, fract, sign, hash, neg, abs

### Verification

- `npm run typecheck` - PASS
- `npm run test` - 2169 tests PASS (all)
- Forbidden-pattern test - PASS (10 tests)

### Semantic Notes

Minor semantic alignment (documented in plan):
- `add`/`mul` now variadic (no practical change - kernels always pass exact arity)
- `select` uses `>0` instead of truthy (matches spec, 0.0 behavior unchanged)
