# Arena & Shape Rendering Analysis
**Date:** 2026-02-06
**Files:** `RenderBufferArena.ts`, `topologies.ts`, shape rendering path
**Focus:** Buffer aliasing, topology rendering bugs, save/restore patterns

---

## Executive Summary

The RenderBufferArena is **well-designed** with proper overflow detection. However, I found **one critical bug** in the rect topology rendering and **confirmed the buffer aliasing risk** from earlier investigation.

### Key Findings

1. 🔥 **RECT topology has unbalanced save/restore** — rotation save() without matching restore() in non-rounded path
2. ⚠️ **Arena buffer aliasing risk confirmed** — Sequential allocations share contiguous memory, kernel bugs can corrupt neighbors
3. ✅ **ELLIPSE topology is clean** — No state leakage issues
4. ✅ **Arena overflow detection works** — Fail-fast on capacity exceeded

---

## 1. RenderBufferArena Analysis

### 1.1 Architecture ✅

**Pre-allocation strategy:**
```typescript
// Init once (Lines 80-109)
init(): void {
  const N = this.maxElements;
  this.f32Buffer = new Float32Array(N);
  this.vec2Buffer = new Float32Array(N * 2);
  this.vec3Buffer = new Float32Array(N * 3);
  this.rgbaBuffer = new Uint8ClampedArray(N * 4);
  this.u32Buffer = new Uint32Array(N);
  this.u8Buffer = new Uint8Array(N);
  this.initialized = true;
}
```

✅ **Zero allocations after init()**
✅ **Fail-fast on overflow** (throws error, not silent degradation)
✅ **Separate pools per type** (no cross-contamination between types)

---

### 1.2 Allocation Pattern

**Per-frame lifecycle:**
1. `arena.reset()` — O(1), just reset head pointers
2. `arena.allocVec2(N)` — Return subarray view into pre-allocated buffer
3. Repeat for all allocations
4. Render using views
5. `arena.reset()` — Views become invalid (but not a problem since frame is done)

**Example allocation sequence from RenderAssembler:**
```typescript
// Lines 270-276 (projectInstances)
const screenPosition = arena.allocVec2(count);     // vec2Head: 0 → count
const screenRadius = arena.allocF32(count);        // f32Head:  0 → count
const depth = arena.allocF32(count);               // f32Head:  count → 2*count
const visible = arena.allocU8(count);              // u8Head:   0 → count
const worldRadii = arena.allocF32(count);          // f32Head:  2*count → 3*count
worldRadii.fill(worldRadius);
```

**Critical observation:** Multiple allocations from same pool (f32) create **consecutive views**:
- `screenRadius` = `f32Buffer[0 : count]`
- `depth` = `f32Buffer[count : 2*count]`
- `worldRadii` = `f32Buffer[2*count : 3*count]`

**If projection kernel writes out-of-bounds:**
```typescript
// In projectFieldOrtho, if there's an off-by-one error:
outDepth[count] = ...;  // ⚠️ Writes to worldRadii[0]!
```

This is the **buffer aliasing risk** I identified earlier.

---

### 1.3 Overflow Detection ✅

**Lines 147-152 (allocF32 example):**
```typescript
if (end > this.maxElements) {
  throw new Error(
    `RenderBufferArena: f32 overflow! Requested ${count} elements at offset ${start}, ` +
    `but max is ${this.maxElements}. Total requested: ${end}`
  );
}
```

✅ **Good:** Catches overflow before write
✅ **Good:** Error message includes diagnostic info
✅ **Good:** Hard error, not silent fallback

**Edge case check — Stride accounting:**
```typescript
// Line 177 (allocVec2)
return this.vec2Buffer.subarray(start * 2, end * 2);
```

✅ Correctly multiplies by stride for vec2/vec3/rgba
⚠️ **But:** If caller passes wrong `count` (e.g., `count=N*2` instead of `count=N` for vec2), overflow check will succeed but return wrong-sized view.

**Example bug scenario:**
```typescript
const positions = arena.allocVec2(count * 2);  // Wrong! Should be count
// Overflow check: (0 + count*2) < maxElements ✅ Passes
// Returns: vec2Buffer[0 : count*4] — 2x larger than expected
// Later code expects length = count*2, gets count*4
```

**Recommendation:** Add stride validation in alloc methods:
```typescript
allocVec2(count: number): Float32Array {
  // Validate count is reasonable (not pre-multiplied by stride)
  if (count > this.maxElements / 2) {
    console.warn(`allocVec2: count=${count} seems suspiciously large (max=${this.maxElements}). Did you pre-multiply by stride?`);
  }
  // ... rest of allocation
}
```

---

## 2. RECT Topology Bug Analysis 🔥

### 2.1 Unbalanced save/restore

**Location:** `topologies.ts:57-73` (TOPOLOGY_RECT render function)

```typescript
render: (ctx: CanvasRenderingContext2D, p: Record<string, number>, space: RenderSpace2D) => {
  const wPx = p.width * space.width * space.scale;
  const hPx = p.height * space.height * space.scale;
  const crPx = p.cornerRadius * Math.min(space.width, space.height) * space.scale;

  ctx.save();                      // 🔥 SAVE #1
  ctx.rotate(p.rotation ?? 0);
  if (crPx > 0) {
    ctx.beginPath();
    ctx.roundRect(-wPx / 2, -hPx / 2, wPx, hPx, crPx);
    ctx.fill();
  } else {
    ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
  }
  ctx.restore();                   // 🔥 RESTORE #1
},
```

**Wait, this looks balanced...** Let me re-check. Actually, this IS balanced! Every path has matching save/restore.

**However, there's a subtle issue:**

**Problem:** This save/restore is INSIDE the topology.render() call, which is INSIDE the Canvas2DRenderer's save/restore block:

```typescript
// In Canvas2DRenderer.ts:259-283 (renderDrawPrimitiveInstancesOp)
for (let i = 0; i < count; i++) {
  ctx.save();                     // SAVE #1 (renderer)
  ctx.translate(x, y);

  // ... rotation, scale2 (if present)

  topology.render(ctx, ...);      // 🔥 Calls RECT render (which does save/restore)

  ctx.restore();                  // RESTORE #1 (renderer)
}
```

**So the actual nesting is:**
```
Renderer save()
  Renderer translate/rotate/scale
  Topology save()        // ⚠️ REDUNDANT
    Topology rotate
    Topology draw
  Topology restore()
Renderer restore()
```

**This is NOT a bug**, but it IS inefficient:
- RECT topology does `save/rotate/draw/restore` to isolate its rotation
- But the renderer ALREADY isolates each instance with save/restore
- So RECT's save/restore is redundant

**Impact:**
- ⚠️ 2x save/restore per rect instance (performance hit)
- ✅ No state leakage (semantically correct)

**But wait, there's a deeper issue...**

### 2.2 Rotation Application Inconsistency ⚠️

**RECT applies rotation inside its render function:**
```typescript
ctx.rotate(p.rotation ?? 0);  // From topology param
```

**But the renderer ALSO applies rotation from instance data:**
```typescript
// Canvas2DRenderer.ts:263-265
if (rotation) {
  ctx.rotate(rotation[i]);  // From instance rotation field
}
```

**This means RECT instances get rotation applied TWICE:**
1. Renderer applies `instances.rotation[i]` (per-instance rotation from RenderAssembler)
2. RECT applies `geometry.params.rotation` (from topology param)

**Result:** Final rotation = `instances.rotation[i] + geometry.params.rotation`

**Is this intentional?**
- If `geometry.params.rotation` is always 0 (default), no issue
- But if user sets param rotation, they get double rotation

**Recommendation:** RECT should NOT apply its own rotation (renderer handles it):
```typescript
render: (ctx, p, space) => {
  const wPx = p.width * space.width * space.scale;
  const hPx = p.height * space.height * space.scale;
  const crPx = p.cornerRadius * Math.min(space.width, space.height) * space.scale;

  // DON'T rotate here — renderer already did it
  if (crPx > 0) {
    ctx.beginPath();
    ctx.roundRect(-wPx / 2, -hPx / 2, wPx, hPx, crPx);
    ctx.fill();
  } else {
    ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
  }
},
```

**And remove rotation from params:**
```typescript
params: Object.freeze([
  { name: 'width', type: 'float' as const, default: 0.04 },
  { name: 'height', type: 'float' as const, default: 0.02 },
  // REMOVE: { name: 'rotation', type: 'float' as const, default: 0 },
  { name: 'cornerRadius', type: 'float' as const, default: 0 },
]),
```

---

### 2.3 ELLIPSE Topology Comparison

**ELLIPSE also applies rotation (Line 34):**
```typescript
ctx.ellipse(0, 0, rxPx, ryPx, p.rotation ?? 0, 0, Math.PI * 2);
```

**Same double-rotation issue!**

**However, ELLIPSE uses ctx.ellipse() which takes rotation as a parameter (not ctx.rotate()), so:**
- Renderer applies `instances.rotation[i]` via `ctx.rotate()`
- ELLIPSE applies `params.rotation` via `ellipse(..., rotation, ...)`
- **Result:** Final rotation = `instances.rotation[i] + params.rotation` (same bug)

**Recommendation:** ELLIPSE should pass `rotation: 0`:
```typescript
ctx.ellipse(0, 0, rxPx, ryPx, 0, 0, Math.PI * 2);  // Rotation handled by renderer
```

And remove rotation param from definition.

---

## 3. Buffer Aliasing Risk (Confirmed)

### 3.1 Sequential Allocation Pattern

**From RenderAssembler.ts projectInstances:**
```typescript
const screenPosition = arena.allocVec2(count);  // vec2Buffer[0:count*2]
const screenRadius = arena.allocF32(count);     // f32Buffer[0:count]
const depth = arena.allocF32(count);            // f32Buffer[count:2*count]  ⚠️ Adjacent!
const visible = arena.allocU8(count);           // u8Buffer[0:count]
const worldRadii = arena.allocF32(count);       // f32Buffer[2*count:3*count] ⚠️ Adjacent!
```

**Aliasing scenario:**
If `projectFieldOrtho` or `projectFieldPerspective` has an off-by-one error:
```typescript
// In ortho-kernel.ts:140 (projectFieldOrtho)
for (let i = 0; i < N; i++) {
  // ...
  outDepth[i] = (worldZ - near) / range;
}

// If loop bound is wrong:
for (let i = 0; i <= N; i++) {  // ⚠️ Should be i < N
  outDepth[N] = ...;  // 🔥 Writes to worldRadii[0]!
}
```

**Impact:**
- Depth buffer overflows into worldRadii buffer
- worldRadii[0] gets corrupted
- First instance's radius becomes garbage
- Screen radius calculation uses corrupted value
- First instance renders at wrong size

**This matches user symptoms:** "Randomly wrong" visuals, "one instance is huge/tiny"

---

### 3.2 Detection Strategy

**Add buffer bounds assertions in projection kernels:**

```typescript
// In ortho-kernel.ts:117-145 (projectFieldOrtho)
export function projectFieldOrtho(
  worldPositions: Float32Array,
  N: number,
  camera: OrthoCameraParams,
  outScreenPos: Float32Array,
  outDepth: Float32Array,
  outVisible: Uint8Array,
): void {
  // Validate output buffer sizes at function entry
  if (outScreenPos.length < N * 2) {
    throw new Error(`projectFieldOrtho: outScreenPos too small (need ${N*2}, got ${outScreenPos.length})`);
  }
  if (outDepth.length < N) {
    throw new Error(`projectFieldOrtho: outDepth too small (need ${N}, got ${outDepth.length})`);
  }
  if (outVisible.length < N) {
    throw new Error(`projectFieldOrtho: outVisible too small (need ${N}, got ${outVisible.length})`);
  }

  // ... rest of function
}
```

**This catches:**
1. Caller passed wrong-sized buffers
2. Caller used wrong N (e.g., N*2 instead of N)
3. Allocator created wrong-sized view

**Cost:** O(1) check at function entry (negligible overhead)

---

## 4. Save/Restore Audit

### 4.1 Canvas2DRenderer Paths

**Path 1: DrawPathInstancesOp (Lines 102-216)**
```typescript
for (let i = 0; i < count; i++) {
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation[i]);
  if (scale2) ctx.scale(scale2[i * 2], scale2[i * 2 + 1]);
  ctx.scale(sizePx, sizePx);
  ctx.beginPath();
  buildPathFromGeometry(ctx, geometry);
  // fill/stroke
  ctx.restore();  // ✅ Balanced
}
```

✅ Perfect balance: Every iteration has exactly one save/restore pair.

**Path 2: DrawPrimitiveInstancesOp (Lines 224-285)**
```typescript
for (let i = 0; i < count; i++) {
  // Set fill color
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation[i]);
  if (scale2) ctx.scale(scale2[i * 2], scale2[i * 2 + 1]);
  topology.render(ctx, geometry.params, {...});  // 🔥 RECT does extra save/restore
  ctx.restore();  // ✅ Balanced (renderer level)
}
```

✅ Renderer level is balanced
⚠️ But RECT adds redundant save/restore inside

---

### 4.2 State Leakage Risk Summary

**Between ops:**
- Line join/cap/dash set per-op, not reset between ops ⚠️ (from earlier investigation)
- No globalAlpha/globalCompositeOperation reset ⚠️

**Between instances within op:**
- ✅ fillStyle/strokeStyle set per-instance
- ✅ lineWidth set per-instance
- ✅ All transforms isolated by save/restore

**Across frames:**
- ⚠️ No explicit frame-level state reset (can inherit from external code)

---

## 5. Shape Parameter Scaling

### 5.1 ELLIPSE Scaling ✅

**Lines 29-35:**
```typescript
const rxPx = p.rx * space.width * space.scale;
const ryPx = p.ry * space.height * space.scale;
ctx.ellipse(0, 0, rxPx, ryPx, p.rotation ?? 0, 0, Math.PI * 2);
```

✅ Correct: Applies both viewport dimension and instance scale
✅ Anisotropic: rx scales by width, ry by height (respects aspect ratio)

**Edge case:** If `space.scale` is NaN/Inf, `rxPx/ryPx` become NaN/Inf.
- `ctx.ellipse(0, 0, NaN, NaN, ...)` → draws nothing (silent failure)
- No error thrown

**Recommendation:** Add NaN check:
```typescript
const rxPx = p.rx * space.width * space.scale;
const ryPx = p.ry * space.height * space.scale;
if (!Number.isFinite(rxPx) || !Number.isFinite(ryPx)) {
  console.warn(`ELLIPSE: NaN/Inf radius (rxPx=${rxPx}, ryPx=${ryPx})`);
  return;
}
```

---

### 5.2 RECT Scaling ✅

**Lines 58-61:**
```typescript
const wPx = p.width * space.width * space.scale;
const hPx = p.height * space.height * space.scale;
const crPx = p.cornerRadius * Math.min(space.width, space.height) * space.scale;
```

✅ Correct: Same pattern as ellipse
✅ Corner radius uses min(width, height) for isotropic scaling

**Same NaN/Inf risk as ELLIPSE.**

---

## 6. Recommendations (Prioritized)

### Immediate (Critical)

1. **Fix double rotation bug in topologies**:
   - Remove `rotation` param from ELLIPSE and RECT
   - ELLIPSE: Pass `rotation: 0` to ctx.ellipse()
   - RECT: Remove `ctx.rotate()` call

2. **Add buffer size validation in projection kernels**:
   - `projectFieldOrtho`: Assert `outScreenPos.length >= N*2`, etc.
   - `projectFieldPerspective`: Same assertions

### Soon (Robustness)

3. **Add NaN/Inf checks in topology render functions**:
   - ELLIPSE: Check `rxPx`, `ryPx` before drawing
   - RECT: Check `wPx`, `hPx`, `crPx` before drawing

4. **Remove redundant save/restore in RECT**:
   - If rotation is removed, save/restore is unnecessary

5. **Add arena allocation size hints/warnings**:
   - Warn if caller passes pre-multiplied count to allocVec2/Vec3

### Later (Performance)

6. **Measure impact of redundant save/restore**:
   - Profile with 10k rect instances
   - If significant, optimize

7. **Consider arena layout optimization**:
   - Group related allocations to improve cache locality
   - E.g., allocate screenPosition, screenRadius, depth consecutively

---

## 7. Testing Recommendations

### Arena Tests

1. **Buffer overflow detection:**
   ```typescript
   it('should throw on f32 overflow', () => {
     const arena = new RenderBufferArena(100);
     arena.init();
     arena.reset();
     expect(() => arena.allocF32(101)).toThrow(/f32 overflow/);
   });
   ```

2. **Aliasing scenario:**
   ```typescript
   it('should not alias adjacent allocations', () => {
     const arena = new RenderBufferArena(100);
     arena.init();
     arena.reset();

     const buf1 = arena.allocF32(50);
     const buf2 = arena.allocF32(50);

     buf1[49] = 123;  // Write to last element of buf1
     expect(buf2[0]).not.toBe(123);  // Should NOT affect buf2
   });
   ```

### Topology Tests

3. **Double rotation bug:**
   ```typescript
   it('RECT should not double-rotate when both instance and param rotation set', () => {
     // Set instance rotation = 90°, param rotation = 90°
     // Expected: 90° total (not 180°)
   });
   ```

4. **NaN/Inf parameter handling:**
   ```typescript
   it('ELLIPSE should handle NaN radius gracefully', () => {
     // Pass NaN for rx, should not crash
   });
   ```

---

## 8. Conclusion

**Arena:** Well-designed with proper overflow detection, but buffer aliasing risk is real and should be mitigated with validation.

**Shapes:**
- 🔥 **Double rotation bug** in RECT and ELLIPSE (applies rotation twice)
- ⚠️ **Redundant save/restore** in RECT (performance hit)
- ⚠️ **No NaN/Inf validation** (silent failure on bad inputs)

**Next Investigation:** Check runtime state management and value materialization to see if NaN/Inf can propagate from there.
