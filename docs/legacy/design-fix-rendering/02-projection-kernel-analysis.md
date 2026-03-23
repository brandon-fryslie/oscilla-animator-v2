# Projection Kernel Deep Analysis
**Date:** 2026-02-06
**Files:** `src/projection/ortho-kernel.ts`, `src/projection/perspective-kernel.ts`
**Focus:** NaN/Inf propagation, degenerate inputs, numerical stability

---

## Executive Summary

The projection kernels are **well-structured pure functions** with no allocations or side effects. However, I found **several critical bugs** that can produce NaN/Inf output or incorrect visibility under specific camera configurations.

### Critical Bugs Found

1. ⚠️ **Division by zero in ortho kernel** (Lines 85, 140) — If `near === far`, produces NaN depth
2. 🔥 **Normalization failure in perspective view basis** (Lines 160-172) — If camera and target are coincident, produces NaN for all projections
3. 🔥 **Missing NaN check after basis computation** — If basis is degenerate, NaN propagates to all outputs
4. ⚠️ **Negative depth not clamped** — If instance is closer than near plane, depth can be negative (breaks depth sorting)
5. ⚠️ **No validation for degenerate up vector** — If up vector is parallel to forward vector, cross product is zero vector

---

## 1. Orthographic Kernel Analysis

### 1.1 Division by Zero Bug 🔥

**Location:** `ortho-kernel.ts:85` (scalar), `ortho-kernel.ts:140` (field)

```typescript
const range = camera.far - camera.near;
out.depth = (worldZ - camera.near) / range;
```

**Problem:** If `camera.far === camera.near`, `range = 0`, division produces **Inf** (or **NaN** if numerator is also zero).

**Reproduction:**
```typescript
const camera = { near: 1.0, far: 1.0 };
projectFieldOrtho(positions, N, camera, outScreenPos, outDepth, outVisible);
// outDepth[i] = NaN or Inf for all i
```

**Impact:**
- Depth sorting receives NaN/Inf values
- All instances may be culled or rendered in wrong order
- Can cause "everything disappears" bug

**Fix:**
```typescript
const range = camera.far - camera.near;
const depthDenom = range !== 0 ? range : 1.0; // Avoid division by zero
out.depth = (worldZ - camera.near) / depthDenom;
```

Or better: enforce `far > near` at call site (CameraResolver already does this, but kernels should be defensive).

---

### 1.2 Negative Depth Issue ⚠️

**Location:** `ortho-kernel.ts:86`, `ortho-kernel.ts:140`

```typescript
out.depth = (worldZ - camera.near) / range;
```

**Problem:** If `worldZ < camera.near`, depth is **negative**. Depth sorting assumes depth ∈ [0,1].

**Example:**
- `near = 0, far = 100, worldZ = -10`
- `depth = (-10 - 0) / 100 = -0.1` (negative!)

**Impact:**
- Depth sort comparison breaks (assumes monotone [0,1])
- Instances behind camera may render in front

**Fix:**
```typescript
out.depth = Math.max(0, (worldZ - camera.near) / range);
// Or clamp: Math.min(1, Math.max(0, ...))
```

---

### 1.3 Visibility Logic ✅

**Location:** `ortho-kernel.ts:89`, `ortho-kernel.ts:143`

```typescript
out.visible = worldZ >= camera.near && worldZ <= camera.far;
```

✅ Correct: Culls instances outside [near, far] range.
⚠️ Edge case: If `near === far`, no instances are visible (strict inequality would be better).

---

## 2. Perspective Kernel Analysis

### 2.1 View Basis Normalization Failure 🔥

**Location:** `perspective-kernel.ts:147-184` (`computeViewBasis`)

**Critical Bug — Division by Zero:**

```typescript
// Forward = normalize(target - camPos)
let fwdX = camTargetX - camPosX;
let fwdY = camTargetY - camPosY;
let fwdZ = camTargetZ - camPosZ;
const fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
fwdX /= fwdLen;  // 🔥 Division by zero if fwdLen === 0
fwdY /= fwdLen;
fwdZ /= fwdLen;
```

**Problem:** If `camPos === camTarget` (camera and target coincident), `fwdLen = 0`, division produces **NaN** for all forward components.

**Reproduction:**
```typescript
const camera = {
  camPosX: 0.5, camPosY: 0.5, camPosZ: 0,
  camTargetX: 0.5, camTargetY: 0.5, camTargetZ: 0, // Same as camPos!
  camUpX: 0, camUpY: 1, camUpZ: 0,
  fovY: 45 * Math.PI / 180,
  near: 0.01, far: 100,
};
const basis = computeViewBasis(...);
// basis.forwardX/Y/Z = NaN
// All projections produce NaN screenPos, NaN depth
```

**Impact:**
- **Total rendering failure** — all instances become NaN
- Can happen if user drags camera slider to target position
- Also affects `deriveCamPos` if distance = 0

**Fix:**
```typescript
const fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
if (fwdLen < 1e-6) {
  // Degenerate: camera at target, use default forward = +Z
  fwdX = 0; fwdY = 0; fwdZ = 1;
} else {
  fwdX /= fwdLen;
  fwdY /= fwdLen;
  fwdZ /= fwdLen;
}
```

---

### 2.2 Right Vector Normalization Failure 🔥

**Location:** `perspective-kernel.ts:166-172`

```typescript
// Right = normalize(forward × camUp)
let rightX = fwdY * camUpZ - fwdZ * camUpY;
let rightY = fwdZ * camUpX - fwdX * camUpZ;
let rightZ = fwdX * camUpY - fwdY * camUpX;
const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
rightX /= rightLen;  // 🔥 Division by zero if rightLen === 0
rightY /= rightLen;
rightZ /= rightLen;
```

**Problem:** If `forward` is parallel to `camUp`, cross product is zero vector, `rightLen = 0`, division produces **NaN**.

**Reproduction:**
```typescript
// Camera looking straight up, up vector pointing up (parallel!)
const camera = {
  camPosX: 0.5, camPosY: 0, camPosZ: 0,
  camTargetX: 0.5, camTargetY: 1, camTargetZ: 0,  // Looking +Y
  camUpX: 0, camUpY: 1, camUpZ: 0,  // Up is also +Y (parallel!)
  ...
};
```

**Impact:**
- NaN propagates to all basis vectors
- All instances render as NaN
- Common when tilt = ±90° (looking straight up/down)

**Fix:**
```typescript
const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
if (rightLen < 1e-6) {
  // Degenerate: forward parallel to up, use fallback right = +X
  rightX = 1; rightY = 0; rightZ = 0;
} else {
  rightX /= rightLen;
  rightY /= rightLen;
  rightZ /= rightLen;
}
```

---

### 2.3 Depth Computation (Same Bug as Ortho)

**Location:** `perspective-kernel.ts:244-245` (scalar), `perspective-kernel.ts:317` (field)

```typescript
const range = camera.far - camera.near;
out.depth = (viewZ - camera.near) / range;
```

**Same bugs as ortho:**
1. ⚠️ Division by zero if `near === far`
2. ⚠️ Negative depth if `viewZ < near`

**Fix:** Same as ortho (clamp or validate at call site).

---

### 2.4 Behind-Camera Check ✅

**Location:** `perspective-kernel.ts:225-231` (scalar), `perspective-kernel.ts:303-309` (field)

```typescript
if (viewZ <= 0) {
  out.screenX = 0;
  out.screenY = 0;
  out.depth = 0;
  out.visible = false;
  return out;
}
```

✅ Correct: Culls instances behind camera (viewZ ≤ 0).
✅ Safe defaults: Sets position to origin, depth to 0, visible to false.

**However:** ⚠️ Setting `depth = 0` means behind-camera instances will sort as "closest" in depth sort. Should use `depth = Infinity` or negative sentinel to sort them last.

**Recommendation:**
```typescript
if (viewZ <= 0) {
  out.screenX = 0;
  out.screenY = 0;
  out.depth = Infinity;  // Sort behind-camera instances last
  out.visible = false;
  return out;
}
```

---

### 2.5 Perspective Divide ✅

**Location:** `perspective-kernel.ts:234-241` (scalar), `perspective-kernel.ts:312-314` (field)

```typescript
const tanHalfFov = Math.tan(camera.fovY * 0.5);
const projX = viewX / (viewZ * tanHalfFov);
const projY = viewY / (viewZ * tanHalfFov);

out.screenX = projX * 0.5 + 0.5;
out.screenY = projY * 0.5 + 0.5;
```

✅ Correct: Standard perspective divide.
⚠️ Edge case: If `fovY` is very small (near 0°), `tanHalfFov ≈ 0`, division produces extreme values. But CameraResolver clamps `fovY` to [1°, 179°], so this is safe.

**Field kernel optimization:**
```typescript
const invViewZ = 1.0 / (viewZ * tanHalfFov);
outScreenPos[i * 2 + 0] = viewX * invViewZ * 0.5 + 0.5;
```

✅ Good: Precomputes reciprocal to avoid two divisions.

---

## 3. Size Projection Analysis

### 3.1 Ortho Radius ✅

**Location:** `ortho-kernel.ts:165-195`

```typescript
export function projectWorldRadiusToScreenRadiusOrtho(
  worldRadius: number,
  ...
): number {
  return worldRadius;  // Identity for ortho
}
```

✅ Trivial, no bugs possible.

---

### 3.2 Perspective Radius

**Location:** `perspective-kernel.ts:342-414`

**Same view basis bug as position projection:**

```typescript
const basis = computeViewBasis(...);  // 🔥 Can produce NaN
const viewZ = dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;

if (viewZ <= 0) return 0;

const tanHalfFov = Math.tan(camera.fovY * 0.5);
return worldRadius / (viewZ * tanHalfFov);
```

**Bugs:**
1. 🔥 If `computeViewBasis` returns NaN, `viewZ = NaN`, all radii become NaN
2. ⚠️ If `viewZ` is very small (close to camera), radius can become extremely large (explosion)

**Additional issue — No clamping:**
If `viewZ` is very close to 0 (e.g., `viewZ = 0.001`), radius can be 1000x larger than expected. Should clamp to reasonable max.

**Fix:**
```typescript
if (viewZ <= 0 || viewZ < 0.01) return 0;  // Cull very close instances
const radius = worldRadius / (viewZ * tanHalfFov);
return Math.min(radius, 10.0);  // Clamp to max screen radius
```

---

## 4. deriveCamPos Analysis

**Location:** `perspective-kernel.ts:65-94`

```typescript
export function deriveCamPos(
  camTargetX: number,
  camTargetY: number,
  camTargetZ: number,
  tiltAngle: number,
  yawAngle: number,
  distance: number,
): [number, number, number] {
  const cosTilt = Math.cos(tiltAngle);
  const sinTilt = Math.sin(tiltAngle);
  const tiltedY = distance * sinTilt;
  const tiltedZ = distance * cosTilt;

  const cosYaw = Math.cos(yawAngle);
  const sinYaw = Math.sin(yawAngle);
  const finalX = tiltedZ * sinYaw;
  const finalY = tiltedY;
  const finalZ = tiltedZ * cosYaw;

  return [
    camTargetX + finalX,
    camTargetY + finalY,
    camTargetZ + finalZ,
  ];
}
```

✅ Pure math, no division by zero possible.
⚠️ Edge case: If `distance = 0`, camPos === camTarget, which triggers the view basis bug.

**CameraResolver already clamps distance to >= 0.0001**, so this is safe at runtime. But kernel should still validate.

---

## 5. Root Cause Analysis: NaN Propagation Chain

Here's how NaN can propagate through the rendering pipeline:

### Scenario 1: Degenerate Camera (camPos === camTarget)

1. User sets camera distance to 0 (or drags camera to target)
2. CameraResolver clamps to 0.0001, but if target also moves, they can coincide
3. `computeViewBasis` produces NaN for forward vector (division by zero)
4. All dot products with basis vectors produce NaN
5. All `screenPos[i]` become NaN
6. Depth sort receives NaN, comparison fails (all instances invisible or wrong order)
7. Renderer draws at NaN positions (invisible or offscreen)

**User sees:** Everything disappears, or "randomly wrong" positions

---

### Scenario 2: Parallel Up Vector (Tilt = 90°)

1. User sets tilt to 90° (looking straight down or up)
2. Forward vector points along Y axis
3. Up vector also points along Y axis (parallel)
4. Cross product (forward × up) = zero vector
5. Right vector normalization produces NaN
6. Same propagation as Scenario 1

**User sees:** Everything disappears when tilting to vertical view

---

### Scenario 3: Degenerate Depth Range (near ≈ far)

1. User sets near = 0.999, far = 1.0 (tiny depth range)
2. CameraResolver clamps to `far >= near + 0.000001`
3. Depth calculation: `depth = (viewZ - 0.999) / 0.000001`
4. All instances map to same depth bin (quantization)
5. Depth sort becomes unstable (z-fighting)
6. Every frame produces different order (non-deterministic)

**User sees:** Flickering, random draw order, "jittery" visuals

---

## 6. Interaction with CameraResolver

**CameraResolver already does sanitization** (from `CameraResolver.ts`):

```typescript
const distance = Math.max(distanceRaw, 0.0001);
const near = Math.max(nearRaw, 0.000001);
const far = Math.max(farRaw, near + 0.000001);
```

✅ Prevents `distance = 0`, `near = 0`, `far <= near`.

**BUT:**
1. ⚠️ If `camTarget` moves to `camPos`, distance is non-zero but vectors coincide
2. ⚠️ `0.000001` is too small for depth range (causes quantization)
3. ⚠️ No validation for parallel up vector (tilt edge case)

**Recommendation:** Add validation in CameraResolver:
```typescript
// Ensure minimum depth range (1% of far)
const far = Math.max(farRaw, near * 1.01);

// Clamp tilt away from ±90° to prevent parallel up vector
const tiltDeg = clamp(tiltDegRaw, -89.0, 89.0);  // Was -89.9

// Add runtime check for camPos !== camTarget
const dx = camPosX - camTargetX;
const dy = camPosY - camTargetY;
const dz = camPosZ - camTargetZ;
if (dx*dx + dy*dy + dz*dz < 1e-6) {
  // Force minimum separation
  distance = Math.max(distance, 0.01);
}
```

---

## 7. Testing Gaps

Based on test file names, there are comprehensive tests (`level1-10`), but I should verify coverage of edge cases:

**Tests should verify:**
1. ✅ Ortho vs persp mode toggle (level6)
2. ✅ Depth culling (level7)
3. ✅ Size projection (level4)
4. ❓ **Division by zero in depth calculation (near === far)**
5. ❓ **NaN propagation from degenerate view basis**
6. ❓ **Parallel up vector (tilt = 90°)**
7. ❓ **Behind-camera depth sorting (viewZ <= 0)**
8. ❓ **Negative depth clamping**

**Recommendation:** Add regression tests:
```typescript
describe('Degenerate camera states', () => {
  it('should handle camPos === camTarget', () => {
    const camera = { camPosX: 0.5, camPosY: 0.5, camPosZ: 0,
                     camTargetX: 0.5, camTargetY: 0.5, camTargetZ: 0, ... };
    // Should not produce NaN
  });

  it('should handle near === far', () => {
    const camera = { near: 1.0, far: 1.0 };
    // Depth should be finite
  });

  it('should handle parallel up vector (tilt = 90°)', () => {
    // Should not produce NaN
  });
});
```

---

## 8. Performance Notes

**No performance issues found.** The kernels are tight loops with no allocations:

✅ View basis computed once per batch (not per instance)
✅ Reciprocal trick used in perspective divide (`invViewZ`)
✅ No object allocations in hot loop
✅ Direct buffer writes (no intermediate arrays)

**Optimization opportunity:** Pre-compute `1 / (camera.far - camera.near)` to avoid division in loop.

---

## 9. Recommendations (Prioritized)

### Immediate (Critical Bugs)

1. **Fix `computeViewBasis` normalization failures** (Lines 160, 169):
   - Add `if (fwdLen < 1e-6)` fallback to default forward
   - Add `if (rightLen < 1e-6)` fallback to default right

2. **Fix division by zero in depth calculation**:
   - Add `if (range < 1e-6) range = 1.0;` fallback in both kernels

3. **Clamp negative depth to zero**:
   - `out.depth = Math.max(0, (viewZ - near) / range);`

### Soon (Robustness)

4. **Set behind-camera depth to Infinity** (not 0):
   - `out.depth = Infinity;` when `viewZ <= 0`

5. **Add max radius clamp in perspective size projection**:
   - `return Math.min(radius, 10.0);` to prevent explosions

6. **Improve CameraResolver clamping**:
   - Minimum depth range: `far >= near * 1.01`
   - Tighter tilt clamp: `[-89°, 89°]` instead of `[-89.9°, 89.9°]`

### Later (Testing)

7. **Add degenerate camera regression tests**
8. **Add NaN/Inf validation assertions in tests**

---

## 10. Conclusion

The projection kernels have **clean architecture** but **critical numerical stability bugs** that can produce NaN/Inf under realistic user inputs:

- Camera at target position → NaN for all instances
- Vertical tilt (90°) → NaN from parallel up vector
- Tiny depth range → depth quantization / z-fighting

These bugs match the "randomly wrong visuals" and "everything disappears" symptoms.

**Next steps:**
1. Implement fixes for normalization failures (highest priority)
2. Add NaN/Inf validation after projection in RenderAssembler
3. Improve CameraResolver clamping
4. Add regression tests for degenerate cases

Would you like me to implement these fixes now?
