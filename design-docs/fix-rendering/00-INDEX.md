# Rendering Bug Investigation - Index
**Date:** 2026-02-06
**Investigator:** Claude (code-monkey mode)
**Status:** Investigation Complete, Fixes Pending

---

## Overview

Comprehensive investigation of rendering pipeline bugs causing "randomly wrong visuals", invisible instances, and transform issues. Found **15 critical bugs** across 4 layers of the rendering stack.

---

## Investigation Documents

### [01-initial-investigation.md](./01-initial-investigation.md)
**Scope:** Canvas2DRenderer, RenderAssembler, CameraResolver
**Focus:** State leakage, save/restore balance, cross-layer coupling

**Key Findings:**
- ✅ No save/restore imbalance in renderer
- ⚠️ Canvas state leakage risk (globalAlpha, stroke properties not reset)
- ⚠️ Cross-layer coupling (`isPathTopology` imported from wrong layer)
- ⚠️ Camera edge cases (distance clamping, depth range)

**Priority Recommendations:**
1. Add frame-level canvas state reset
2. Add NaN/Inf validation after projection
3. Move `isPathTopology` to shapes layer
4. Add camera parameter clamping

---

### [02-projection-kernel-analysis.md](./02-projection-kernel-analysis.md)
**Scope:** ortho-kernel.ts, perspective-kernel.ts
**Focus:** NaN/Inf propagation, degenerate camera states, numerical stability

**Critical Bugs Found:**
1. 🔥 **Division by zero in depth calculation** — `(far - near) = 0` produces NaN
2. 🔥 **View basis normalization failure** — Camera at target produces NaN for all instances
3. 🔥 **Parallel up vector** — Tilt = ±90° produces NaN from cross product
4. ⚠️ **Negative depth** — Instances behind camera have negative depth (breaks sorting)
5. ⚠️ **Behind-camera depth** — Set to 0 instead of Infinity (wrong sort order)

**Impact:** Complete rendering failure when camera is degenerate (camPos === camTarget, tilt = 90°)

**Priority Recommendations:**
1. Fix `computeViewBasis` normalization failures (add fallbacks)
2. Fix division by zero in depth calculation
3. Clamp negative depth to 0
4. Set behind-camera depth to Infinity

---

### [03-arena-and-shape-analysis.md](./03-arena-and-shape-analysis.md)
**Scope:** RenderBufferArena, topologies (ELLIPSE, RECT)
**Focus:** Buffer aliasing, topology rendering bugs, redundant operations

**Critical Bugs Found:**
1. 🔥 **Double rotation bug** — RECT and ELLIPSE apply rotation twice (instance + param)
2. ⚠️ **Buffer aliasing risk** — Sequential allocations share contiguous memory
3. ⚠️ **Redundant save/restore** — RECT does extra save/restore (performance hit)
4. ⚠️ **No NaN/Inf validation in topologies** — Silent failure on bad scale values

**Impact:** Rotated shapes render at 2x rotation, performance hit from redundant operations

**Priority Recommendations:**
1. Remove rotation param from ELLIPSE and RECT
2. Add buffer size validation in projection kernels
3. Add NaN/Inf checks in topology render functions
4. Remove redundant save/restore

---

### [04-nan-propagation-analysis.md](./04-nan-propagation-analysis.md)
**Scope:** ValueExprMaterializer, opcode evaluation, intrinsics
**Focus:** Sources of NaN/Inf in value computation pipeline

**Critical Bugs Found:**
1. 🔥 **Division by zero in `div` opcode** — No zero check
2. 🔥 **sqrt(-x) produces NaN** — No domain validation
3. 🔥 **log(0) and log(-x) produce -Inf/NaN** — No domain validation
4. 🔥 **normalizedIndex when count=1** — Division by `(count - 1) = 0`
5. ⚠️ **pow(-x, fractional) produces NaN** — Negative base + fractional exponent

**Impact:** NaN/Inf silently propagates from user expressions → invisible/misplaced instances

**Priority Recommendations:**
1. Fix division by zero in all opcodes (div, normalizedIndex, rank)
2. Add domain validation for math functions (sqrt, log, pow)
3. Add NaN/Inf sanitization in `evaluatePureFn`
4. Add post-projection culling for NaN instances

---

## Bug Summary by Severity

### 🔥 Critical (Causes Total Rendering Failure)

| # | Bug | File | Line | Fix Complexity |
|---|-----|------|------|----------------|
| 1 | View basis normalization (camPos === camTarget) | perspective-kernel.ts | 157-163 | Medium |
| 2 | View basis normalization (parallel up vector) | perspective-kernel.ts | 166-172 | Medium |
| 3 | Division by zero in depth calculation | ortho/perspective-kernel.ts | 85, 244 | Easy |
| 4 | Division by zero in `div` opcode | ValueExprMaterializer.ts | 399 | Easy |
| 5 | sqrt(-x) produces NaN | ValueExprMaterializer.ts | 410 | Easy |
| 6 | log(0)/-x produces -Inf/NaN | ValueExprMaterializer.ts | 412 | Easy |
| 7 | normalizedIndex when count=1 | ValueExprMaterializer.ts | 454 | Easy |
| 8 | Double rotation in RECT/ELLIPSE | topologies.ts | 34, 64 | Medium |

**Total:** 8 critical bugs

---

### ⚠️ High Priority (Causes Wrong Visuals)

| # | Bug | File | Line | Fix Complexity |
|---|-----|------|------|----------------|
| 9 | Negative depth not clamped | ortho/perspective-kernel.ts | 86, 245 | Easy |
| 10 | Behind-camera depth = 0 (should be Inf) | perspective-kernel.ts | 228 | Easy |
| 11 | Canvas state leakage (stroke properties) | Canvas2DRenderer.ts | 135-147 | Easy |
| 12 | Buffer aliasing (no validation) | ortho/perspective-kernel.ts | 117-145 | Medium |
| 13 | pow(-x, frac) produces NaN | ValueExprMaterializer.ts | 401 | Easy |

**Total:** 5 high-priority bugs

---

### ⚠️ Medium Priority (Performance/Robustness)

| # | Bug | File | Line | Fix Complexity |
|---|-----|------|------|----------------|
| 14 | Redundant save/restore in RECT | topologies.ts | 63-72 | Easy |
| 15 | No NaN/Inf validation in topologies | topologies.ts | 29-35, 57-73 | Easy |
| 16 | Cross-layer coupling (`isPathTopology`) | Canvas2DRenderer.ts | 29 | Easy |
| 17 | Camera distance/depth range clamping | CameraResolver.ts | 137-142 | Easy |

**Total:** 4 medium-priority bugs

---

## Root Cause Categories

### 1. Numerical Stability (7 bugs)
- Division by zero: depth, div opcode, normalizedIndex
- Domain violations: sqrt, log, pow
- Normalization failures: view basis

### 2. Edge Case Handling (4 bugs)
- Single-instance (count=1): normalizedIndex, grid UV, rank
- Degenerate camera: camPos === camTarget, parallel up vector
- Behind-camera instances: negative depth, depth=0

### 3. State Management (2 bugs)
- Canvas state leakage: stroke properties, globalAlpha
- Double rotation: topology params + instance rotation

### 4. Architecture (2 bugs)
- Cross-layer coupling: isPathTopology import
- Buffer aliasing: no validation

---

## Propagation Chains

### Chain 1: Degenerate Camera → Total Failure
```
User sets camera distance = 0 (or drags to target)
  → deriveCamPos produces camPos === camTarget
    → computeViewBasis divides by zero (fwdLen = 0)
      → All basis vectors = NaN
        → All projections = NaN
          → All instances invisible
```

### Chain 2: Division by Zero → Invisible Instance
```
User writes: position.x = 1 / y (where y = 0)
  → div opcode produces Inf
    → position.x = Inf
      → projection: screenPos.x = Inf
        → ctx.translate(Inf, y)
          → Instance drawn offscreen (invisible)
```

### Chain 3: Single Instance → NaN
```
Instance has count = 1
  → normalizedIndex[0] = 0 / (1 - 1) = NaN
    → User: position = normalizedIndex
      → position.x = NaN
        → projection: screenPos = NaN
          → Instance invisible
```

### Chain 4: Negative sqrt → Black Color
```
User writes: color.r = sqrt(x) (where x < 0)
  → sqrt opcode produces NaN
    → color.r = NaN
      → RenderAssembler: rgbaBuffer[i] = NaN * 255 = NaN
        → Canvas: fillStyle = rgba(NaN, ...) → black
```

---

## Fix Implementation Plan

### Phase 1: Critical NaN/Inf Fixes (Immediate)
**Estimated Time:** 2-3 hours
**Files:** 3 (perspective-kernel.ts, ortho-kernel.ts, ValueExprMaterializer.ts)

1. Add fallbacks in `computeViewBasis` for normalization failures
2. Fix division by zero in depth calculation (both kernels)
3. Fix division by zero in `div` opcode
4. Add domain validation for `sqrt`, `log`, `pow`
5. Fix `normalizedIndex` for count=1

**Testing:** Add regression tests for each fix

---

### Phase 2: Rendering Correctness (Soon)
**Estimated Time:** 1-2 hours
**Files:** 2 (topologies.ts, CameraResolver.ts)

1. Remove rotation param from ELLIPSE and RECT
2. Clamp negative depth to 0
3. Set behind-camera depth to Infinity
4. Add NaN/Inf validation in topology render functions
5. Improve camera parameter clamping

**Testing:** Visual regression tests, camera edge cases

---

### Phase 3: Validation & Robustness (Later)
**Estimated Time:** 2-3 hours
**Files:** 4 (RenderAssembler.ts, Canvas2DRenderer.ts, shapes/types.ts, projection kernels)

1. Add buffer size validation in projection kernels
2. Add frame-level canvas state reset
3. Move `isPathTopology` to shapes layer
4. Add NaN/Inf sanitization in `evaluatePureFn`
5. Add post-projection culling for NaN instances

**Testing:** Integration tests, performance benchmarks

---

### Phase 4: Monitoring & Diagnostics (Optional)
**Estimated Time:** 1-2 hours
**Files:** 1 (HealthMonitor.ts)

1. Add NaN/Inf counters to health monitor
2. Add runtime warnings for edge cases
3. Add diagnostic logging for degenerate states

---

## Testing Strategy

### Regression Tests (Per Bug)
Each fix should have a corresponding test:
```typescript
// Example for division by zero
it('div opcode handles division by zero', () => {
  const result = evaluatePureFn({kind:'opcode', opcode:'div'}, [1, 0]);
  expect(result).toBe(0);
  expect(Number.isFinite(result)).toBe(true);
});
```

### Integration Tests (Propagation Chains)
End-to-end tests for common failure modes:
```typescript
it('single instance with normalizedIndex renders correctly', () => {
  // Create instance with count=1 using normalizedIndex for position
  const frame = renderFrame(...);
  // Should have 1 visible instance, not 0
  expect(frame.ops[0].instances.count).toBe(1);
});
```

### Visual Regression Tests
Capture screenshots for edge cases:
- Camera at target (should not crash)
- Camera tilt = 90° (should render)
- Single instance (should be visible)
- Division by zero in user expression (should render with default)

---

## Success Criteria

### Immediate Goals (Phase 1)
- [ ] No NaN/Inf produced by projection kernels (degenerate camera)
- [ ] No NaN/Inf produced by opcodes (div, sqrt, log)
- [ ] Single-instance graphs render correctly
- [ ] All regression tests pass

### Medium-Term Goals (Phase 2-3)
- [ ] Rotation rendering is correct (no double-rotation)
- [ ] Depth sorting works correctly (negative depth, behind-camera)
- [ ] Canvas state doesn't leak between ops
- [ ] Buffer aliasing is detected and prevented

### Long-Term Goals (Phase 4)
- [ ] Runtime monitoring detects NaN/Inf issues
- [ ] Diagnostic logging helps debug user reports
- [ ] Performance benchmarks show no regression

---

## Known Issues Not Addressed

1. **Precision issues in depth sorting** — Mentioned in 02-projection, but not critical
2. **Topology render performance** — RECT redundant save/restore is a perf hit, not a bug
3. **Arena capacity planning** — No dynamic resize, fixed at init (by design)
4. **HSL→RGB conversion** — Not audited (potential NaN source)

---

## Next Actions

**User Decision Required:**

1. **Should I implement the fixes now?** (Phases 1-3, ~6-8 hours)
2. **Should I focus on Phase 1 only?** (Critical bugs, ~2-3 hours)
3. **Should I create GitHub issues for tracking?**
4. **Should I write more tests before fixing?**

**Recommended:** Start with Phase 1 (critical NaN/Inf fixes), verify with tests, then proceed to Phase 2.

---

## References

- Spec: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md`
- Camera spec: `design-docs/_new/3d/camera-v2/01-basics.md`
- Projection tests: `src/projection/__tests__/level*.test.ts`
- Type system: `.claude/rules/TYPE-SYSTEM-INVARIANTS.md`
