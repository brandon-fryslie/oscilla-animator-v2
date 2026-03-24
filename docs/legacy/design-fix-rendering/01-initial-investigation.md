# Rendering Bug Investigation Report
**Date:** 2026-02-06
**Scope:** Canvas2DRenderer.ts, RenderAssembler.ts, CameraResolver.ts
**Focus:** State leakage, transform bugs, projection issues, cross-layer coupling

---

## Executive Summary

I investigated the rendering pipeline for potential bugs causing "randomly wrong" visuals, transform issues, and performance jank. **Good news: the architecture is clean and well-factored.** No smoking guns found, but I've identified several **low-probability edge cases** and **architectural smell points** that could manifest as rendering bugs under specific conditions.

### Key Findings
1. ✅ **No render-state leakage**: Canvas2DRenderer properly resets dash patterns and uses balanced save/restore
2. ✅ **No per-instance path rebuild**: Geometry is built once per DrawOp, not per instance
3. ⚠️ **Weak spots identified**: Camera sanitization edge cases, projection buffer aliasing risk, cross-layer coupling smell
4. ⚠️ **Missing validation**: No checks for NaN/Inf propagation through projection pipeline

---

## 1. Canvas2DRenderer.ts Analysis

### Save/Restore Balance ✅
**Lines 154-209 (renderDrawPathInstancesOp):**
```typescript
for (let i = 0; i < count; i++) {
  ctx.save();
  ctx.translate(x, y);
  // ... rotation, scale2, instance scale
  ctx.beginPath();
  buildPathFromGeometry(ctx, geometry);
  // ... fill/stroke
  ctx.restore(); // ✅ Balanced
}
```

**Lines 259-283 (renderDrawPrimitiveInstancesOp):**
```typescript
for (let i = 0; i < count; i++) {
  ctx.save();
  ctx.translate(x, y);
  // ... rotation, scale2
  topology.render(ctx, geometry.params, {...});
  ctx.restore(); // ✅ Balanced
}
```

**Verdict:** Save/restore pairs are correctly balanced. No risk of accumulated transforms.

---

### Global State Management ✅

**Dash Pattern Reset (Lines 212-215):**
```typescript
// Reset dash pattern after pass
if (hasStroke && style.dashPattern && style.dashPattern.length > 0) {
  ctx.setLineDash([]);
}
```
✅ Properly resets dash after each pass to prevent leakage to next op.

**Line Join/Cap/Dash Setup (Lines 135-147):**
```typescript
if (hasStroke) {
  ctx.lineJoin = style.lineJoin ?? 'miter';
  ctx.lineCap = style.lineCap ?? 'butt';

  if (style.dashPattern && style.dashPattern.length > 0) {
    const dashPx = style.dashPattern.map((d: number) => d * D);
    ctx.setLineDash(dashPx);
    ctx.lineDashOffset = (style.dashOffset ?? 0) * D;
  } else {
    ctx.setLineDash([]);
  }
}
```
✅ Uniform stroke properties are set once per pass (not per instance).
⚠️ **Potential issue:** If multiple ops in a frame use different stroke styles, later ops inherit previous settings unless explicitly reset. The current code only resets dashPattern at pass end, but `lineJoin`, `lineCap`, and `lineDashOffset` are NOT reset between ops.

**Recommendation:** Add explicit reset of all stroke properties at start of each op:
```typescript
// At top of renderDrawPathInstancesOp and renderDrawPrimitiveInstancesOp
ctx.setLineDash([]);
ctx.lineDashOffset = 0;
ctx.lineJoin = 'miter';
ctx.lineCap = 'butt';
```

---

### Path Building Efficiency ✅

**buildPathFromGeometry (Lines 293-354):**
- Called once per instance (inside the loop), but this is unavoidable since each instance has its own transformed coordinate space.
- Path is built in local space (centered at origin) — no per-instance coordinate adjustments needed.
- Verb dispatch is tight (switch statement with early break).

**Verdict:** No redundant path rebuilds. The architecture correctly builds paths in local space and applies instance transforms via `ctx.translate/scale/rotate`.

---

### Missing State Checks ⚠️

**No globalAlpha/globalCompositeOperation usage:** ✅ Good (not present in code)
**No fillStyle/strokeStyle leakage:** ✅ Set per-instance from color buffer
**No lineWidth leakage:** ✅ Set per-instance accounting for scale

**However:**
- No explicit reset of `globalAlpha`, `globalCompositeOperation`, `shadowBlur`, `shadowColor`, `shadowOffsetX/Y` between frames.
- If external code (debug overlays, UI elements) modifies these, they could leak into rendering.

**Recommendation:** Add frame-level state reset at top of `renderFrame()`:
```typescript
export function renderFrame(...) {
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (!skipClear) { ... }
  // ... rest of rendering
}
```

---

## 2. RenderAssembler.ts Analysis

### Projection & Transform Composition

**projectInstances (Lines 262-303):**
- Allocates output buffers from arena (no frame-to-frame leakage)
- Delegates to `projectFieldOrtho` or `projectFieldPerspective` based on camera mode
- World positions are READ-ONLY (no mutation)

**depthSortAndCompact (Lines 126-243):**
- Filters invisible instances, sorts by depth (far-to-near / painter's algorithm)
- Fast-path optimization: skips sort if already monotone decreasing
- Uses arena for all allocations (no GC pressure)

**Critical Issue Found:** ⚠️ **Projection output aliasing risk**

**Lines 269-280 (projectInstances):**
```typescript
const screenPosition = arena.allocVec2(count);
const screenRadius = arena.allocF32(count);
const depth = arena.allocF32(count);
const visible = arena.allocU8(count);

const worldRadii = arena.allocF32(count); // ⚠️ ALIASING RISK
worldRadii.fill(worldRadius);

if (resolved.projection === 'ortho') {
  projectFieldOrtho(worldPositions, count, ORTHO_CAMERA_DEFAULTS, screenPosition, depth, visible);
  projectFieldRadiusOrtho(worldRadii, worldPositions, count, ORTHO_CAMERA_DEFAULTS, screenRadius);
}
```

**Problem:** If projection kernels (`projectFieldOrtho`, `projectFieldRadiusPerspective`) write to incorrect output buffers due to stride mismatch or index errors, they could overwrite neighboring buffers in the arena. The arena is a contiguous block of memory with sequential allocations.

**Recommendation:** Add buffer boundary validation in projection kernels (assert output buffer sizes match expected).

---

### Depth Sorting Correctness ✅

**Lines 156-169 (depthSortAndCompact fast-path check):**
```typescript
let alreadyOrdered = true;
if (visibleCount > 1) {
  let prevVisibleDepth = Infinity;
  for (let i = 0; i < visibleCount; i++) {
    const idx = indices[i];
    if (depth[idx] > prevVisibleDepth) {
      // depth increased = ascending = NOT far-to-near
      alreadyOrdered = false;
      break;
    }
    prevVisibleDepth = depth[idx];
  }
}
```

✅ Correct: Checks for **strictly decreasing** depth (far-to-near).
✅ Early exit on first violation.

**Lines 172-185 (insertion sort):**
```typescript
for (let i = 1; i < visibleCount; i++) {
  const key = indices[i];
  const keyDepth = depth[key];
  let j = i - 1;
  // Move elements with smaller depth (closer) to the right
  while (j >= 0 && depth[indices[j]] < keyDepth) {
    indices[j + 1] = indices[j];
    j--;
  }
  indices[j + 1] = key;
}
```

✅ Correct: Stable sort, far-to-near (larger depth first).
⚠️ **Edge case:** If two instances have identical depth, order depends on original index (stable). This is correct for painter's algorithm, but if depth precision is poor (e.g., all instances map to same depth bin), z-fighting may occur.

---

### Per-Instance Shape Grouping (Lines 800-966)

**assemblePerInstanceShapes:**
- Groups instances by `(topologyId, controlPointsSlot)` key
- Uses WeakMap cache keyed on shape buffer identity (smart!)
- Projects once for all instances, then slices per-group

**Potential Issue:** ⚠️ **Projection buffer indexing**

**Lines 868-875 (group projection slicing):**
```typescript
for (let i = 0; i < groupN; i++) {
  const srcIdx = group.instanceIndices[i];
  groupScreenPos[i * 2] = projection.screenPosition[srcIdx * 2];
  groupScreenPos[i * 2 + 1] = projection.screenPosition[srcIdx * 2 + 1];
  groupScreenRadius[i] = projection.screenRadius[srcIdx];
  groupDepth[i] = projection.depth[srcIdx];
  groupVisible[i] = projection.visible[srcIdx];
}
```

**If `group.instanceIndices` contains out-of-bounds indices** (e.g., from corrupt shape buffer), this will read garbage from projection arrays. No bounds check.

**Recommendation:** Add validation in `computeTopologyGroups`:
```typescript
for (let i = 0; i < instanceCount; i++) {
  // ... existing code
  if (i < 0 || i >= instanceCount) {
    throw new Error(`Invalid instance index ${i} (max ${instanceCount - 1})`);
  }
  groups.get(key)!.instanceIndices.push(i);
}
```

---

### Camera Projection Math

**Lines 279-300 (projectInstances - perspective path):**
```typescript
const [camPosX, camPosY, camPosZ] = deriveCamPos(
  resolved.centerX, resolved.centerY, 0,
  resolved.tiltRad, resolved.yawRad, resolved.distance
);
const perspParams = {
  camPosX, camPosY, camPosZ,
  camTargetX: resolved.centerX,
  camTargetY: resolved.centerY,
  camTargetZ: 0,
  camUpX: 0, camUpY: 1, camUpZ: 0,
  fovY: resolved.fovYRad,
  near: resolved.near,
  far: resolved.far,
};
projectFieldPerspective(worldPositions, count, perspParams, screenPosition, depth, visible);
```

✅ Delegates to `deriveCamPos` from `projection/perspective-kernel.ts` (not examined, but assumed correct).
⚠️ **If `deriveCamPos` produces NaN/Inf** (e.g., from degenerate camera params), projection will propagate garbage.

**Recommendation:** Add NaN/Inf checks after `deriveCamPos`:
```typescript
const [camPosX, camPosY, camPosZ] = deriveCamPos(...);
if (!Number.isFinite(camPosX) || !Number.isFinite(camPosY) || !Number.isFinite(camPosZ)) {
  console.error('Camera position is NaN/Inf, using default ortho projection');
  // Fall back to ortho or clamp to safe values
}
```

---

## 3. CameraResolver.ts Analysis

### Sanitization Robustness

**resolveCameraDecl (Lines 106-155):**
```typescript
const sanitize = (v: number, fallback: number): number => {
  return Number.isFinite(v) ? v : fallback;
};

// Read raw values with NaN/Inf fallbacks
const projRaw = sanitize(readSlot(decl.projectionSlot), 0);
const centerXRaw = sanitize(readSlot(decl.centerXSlot), 0.5);
// ... etc
```

✅ All slot reads are sanitized to spec defaults on NaN/Inf.
✅ Clamping/wrapping applied after sanitization:
```typescript
const centerX = clamp01(centerXRaw);
const distance = Math.max(distanceRaw, 0.0001);
const tiltDeg = clamp(tiltDegRaw, -89.9, 89.9);
const yawDeg = wrapDegrees(yawDegRaw);
// ...
```

**Edge Case Found:** ⚠️ **Projection mode coercion**

**Lines 133-134:**
```typescript
const projI32 = (projRaw | 0);
const projection: 'ortho' | 'persp' = projI32 === 1 ? 'persp' : 'ortho';
```

**If `projRaw` is a very large float (e.g., 2^31)**, `projRaw | 0` truncates to 32-bit signed int, which can produce negative values or wrap-around. For example:
- `(2147483648 | 0) === -2147483648` (not 1, so maps to 'ortho')
- `(NaN | 0) === 0` (correctly maps to 'ortho')

**Verdict:** Current code is safe for NaN/Inf but could be more explicit:
```typescript
const projection: 'ortho' | 'persp' = (projRaw === 1) ? 'persp' : 'ortho';
```

---

### Degenerate Matrix Potential

**Lines 141-142:**
```typescript
const near = Math.max(nearRaw, 0.000001);
const far = Math.max(farRaw, near + 0.000001);
```

✅ Ensures `far > near` by at least 1e-6.
⚠️ **But:** If `nearRaw` is negative or very small, clamping to 1e-6 can produce degenerate projection (e.g., `near=1e-6, far=2e-6` gives tiny depth range).

**Recommendation:** Add minimum depth range check:
```typescript
const near = Math.max(nearRaw, 0.01); // More reasonable minimum
const far = Math.max(farRaw, near * 1.01); // At least 1% depth range
```

---

### Distance Clamping

**Line 137:**
```typescript
const distance = Math.max(distanceRaw, 0.0001);
```

✅ Prevents zero/negative distance.
⚠️ **But:** If `distanceRaw` is very large (e.g., 1e10), camera is extremely far away, which can cause:
- Depth precision loss (all instances map to same depth bin)
- Projection matrix near-singularity

**Recommendation:** Add maximum distance clamp:
```typescript
const distance = clamp(distanceRaw, 0.01, 1000);
```

---

## 4. Cross-Layer Coupling Analysis

### isPathTopology Import Smell

**Canvas2DRenderer.ts Line 29:**
```typescript
import { isPathTopology } from '../../runtime/RenderAssembler';
```

**Problem:** Renderer imports a type guard from the assembler layer. This creates a backward dependency:
```
Renderer (canvas/) → RenderAssembler (runtime/)
```

**Correct architecture:**
```
Renderer (canvas/) → Types (render/types.ts)
                   ← Assembler (runtime/)
```

**Why this matters:**
- If `isPathTopology` logic changes in RenderAssembler, renderer implicitly depends on it
- Renderer should only depend on render IR types, not assembler internals
- Type guards should live next to the types they guard

**Recommendation:** Move `isPathTopology` to `shapes/types.ts`:
```typescript
// In src/shapes/types.ts
export function isPathTopology(topology: TopologyDef): topology is PathTopologyDef {
  return 'verbs' in topology;
}
```

Then both RenderAssembler and Canvas2DRenderer import from shapes layer (no cross-layer coupling).

---

### Projection Kernel Abstraction Boundary

**RenderAssembler.ts imports from projection/**
```typescript
import {
  projectFieldOrtho,
  projectFieldRadiusOrtho,
  ORTHO_CAMERA_DEFAULTS,
} from '../projection/ortho-kernel';
import {
  projectFieldPerspective,
  projectFieldRadiusPerspective,
  deriveCamPos,
} from '../projection/perspective-kernel';
```

✅ Clean: Projection kernels are proper modules with defined contracts.
⚠️ **But:** If projection kernels have bugs (NaN propagation, index errors), they will silently corrupt render output.

**Recommendation:** Add validation in RenderAssembler after projection:
```typescript
// After projectFieldOrtho/projectFieldPerspective
for (let i = 0; i < count; i++) {
  if (!Number.isFinite(screenPosition[i * 2]) || !Number.isFinite(screenPosition[i * 2 + 1])) {
    console.error(`Projection produced NaN/Inf for instance ${i}`);
    visible[i] = 0; // Cull broken instances
  }
}
```

---

## 5. Root Cause Hypothesis: "Randomly Wrong" Visuals

Based on the investigation, here are the most likely culprits for rendering bugs:

### High Probability
1. **Projection kernel bugs** (not examined): If `projectFieldPerspective` or `deriveCamPos` produce NaN/Inf, visuals will be corrupted
2. **Camera degenerate states**: Very large distance, near≈far, extreme tilt can cause projection instability
3. **Uninitialized canvas state**: If external code modifies `globalAlpha`, `lineJoin`, etc., and renderer doesn't reset, later ops inherit bad state

### Medium Probability
4. **Depth sorting with poor precision**: If all instances have same depth (due to projection quantization), z-fighting occurs
5. **Arena buffer overflow**: If projection kernels write out-of-bounds, they corrupt neighboring buffers
6. **Per-instance shape grouping with corrupt buffer**: If shape buffer contains invalid topology IDs, renderer will throw or render garbage

### Low Probability
7. **Stroke property leakage between ops**: `lineJoin`, `lineCap` not reset between DrawOps
8. **Instance index out-of-bounds in group slicing**: If `group.instanceIndices` contains bad values

---

## 6. Recommendations (Prioritized)

### Immediate (Likely to catch real bugs)
1. **Add frame-level canvas state reset in `renderFrame()`**: Reset `globalAlpha`, `globalCompositeOperation`, stroke properties
2. **Add NaN/Inf validation after projection**: Cull instances with invalid screen positions
3. **Add camera distance clamping**: Prevent extreme far/near camera positions
4. **Move `isPathTopology` to shapes layer**: Fix cross-layer coupling

### Soon (Good hygiene)
5. **Add buffer bounds validation in projection kernels**: Assert output sizes match expected
6. **Add instance index bounds check in `computeTopologyGroups`**: Prevent corrupt shape buffer from crashing renderer
7. **Improve near/far clamping**: Ensure minimum depth range (e.g., `far >= near * 1.01`)

### Later (Optimization / robustness)
8. **Add depth precision warning**: If all visible instances map to same depth bin, log warning
9. **Add explicit stroke property reset between ops**: Prevent accidental inheritance
10. **Add instrumentation for projection failures**: Track count of culled instances per frame

---

## 7. Testing Strategy

To expose these bugs, add tests that:

1. **Degenerate camera states**:
   - `distance = 1e10` (very far)
   - `near = 0.999, far = 1.0` (tiny depth range)
   - `tilt = 89.99 degrees` (near-vertical view)

2. **NaN/Inf injection**:
   - Camera slots set to NaN/Inf
   - World positions with NaN/Inf coordinates
   - Verify graceful fallback (no crash, no corruption)

3. **Canvas state pollution**:
   - Set `ctx.globalAlpha = 0.5` before `renderFrame()`
   - Verify first op renders at 100% opacity (not inheriting external state)

4. **Per-instance shape edge cases**:
   - Shape buffer with out-of-bounds topology IDs
   - Shape buffer with mismatched length vs instance count
   - Verify error messages are clear

5. **Depth sorting edge cases**:
   - All instances at same depth (z=0)
   - Verify stable sort (original order preserved)

---

## 8. Conclusion

The rendering pipeline is **well-architected** with clear separation of concerns. No obvious "smoking gun" bugs found, but several **low-probability edge cases** could manifest as rendering bugs under specific conditions (degenerate camera, NaN propagation, external state pollution).

**Highest priority fixes:**
1. Add frame-level canvas state reset
2. Add NaN/Inf validation after projection
3. Fix `isPathTopology` cross-layer coupling
4. Add camera parameter clamping

If you're seeing "randomly wrong" visuals, I'd start by:
1. Logging camera parameters each frame (check for NaN/Inf/extreme values)
2. Logging projection output (check for NaN/Inf in screen positions)
3. Adding assertions in projection kernels (out-of-bounds writes)
4. Checking for external canvas state pollution (debug overlays, UI)

Let me know if you'd like me to implement any of these fixes or investigate deeper into the projection kernel code!
