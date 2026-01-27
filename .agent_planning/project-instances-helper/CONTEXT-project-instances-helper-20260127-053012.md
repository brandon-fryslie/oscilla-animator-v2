# Implementation Context: Extract projectInstances + depthSortAndCompact Pattern

**Date:** 2026-01-27 05:30:12  
**File:** `src/runtime/RenderAssembler.ts`  
**Related Plan:** `PLAN-project-instances-helper-20260127-053012.md`

---

## Overview

This document provides implementation context for extracting the repeated `projectInstances() → depthSortAndCompact() → copy buffers` pattern into reusable helpers. It includes:
- Code snippets from both call sites
- Function signatures and contracts
- Memory management details
- Line-by-line refactoring guidance

---

## Section 1: Existing Functions

### 1.1 `projectInstances()`

**Location:** `src/runtime/RenderAssembler.ts:297-348`

**Signature:**
```typescript
export function projectInstances(
  worldPositions: Float32Array,      // READ-ONLY input
  worldRadius: number,                // Uniform radius
  count: number,
  resolved: ResolvedCameraParams,    // Camera params (ortho/persp)
  pool?: BufferPool,                  // Optional pool for allocations
): ProjectionOutput
```

**Returns:**
```typescript
interface ProjectionOutput {
  screenPosition: Float32Array;    // stride 2, [0,1] normalized
  screenRadius: Float32Array;       // per-instance
  depth: Float32Array;              // for sorting
  visible: Uint8Array;              // 1=visible, 0=culled
}
```

**Memory Contract:**
- Allocates buffers from `pool` if provided (for memory management)
- Falls back to direct allocation if no pool
- Returns OWNED buffers (pool or direct)
- Input `worldPositions` is READ-ONLY, never mutated

**Usage:** Projects 3D world positions to 2D screen space (orthographic or perspective)

---

### 1.2 `depthSortAndCompact()`

**Location:** `src/runtime/RenderAssembler.ts:163-282`

**Signature:**
```typescript
export function depthSortAndCompact(
  projection: ProjectionOutput,
  count: number,
  color: Uint8ClampedArray,         // Per-instance RGBA
  rotation?: Float32Array,           // Optional per-instance rotation
  scale2?: Float32Array,             // Optional anisotropic scale
): {
  count: number;                     // Compacted count (visible only)
  screenPosition: Float32Array;      // Compacted positions
  screenRadius: Float32Array;        // Compacted radii
  depth: Float32Array;               // Compacted + sorted depths
  color: Uint8ClampedArray;          // Compacted colors
  rotation?: Float32Array;           // Compacted rotations (if provided)
  scale2?: Float32Array;             // Compacted scales (if provided)
}
```

**Memory Contract (CRITICAL):**
- Returns VIEWS into module-level pooled buffers (lines 56-85)
- Valid ONLY until next call to `depthSortAndCompact` or next frame
- **Callers MUST copy** for persistent storage
- Comment at lines 145-154 explicitly warns:
  ```typescript
  // ⚠️ MEMORY CONTRACT - CRITICAL:
  // Returned buffers are VIEWS into module-level pooled storage. They are valid ONLY until:
  // - The next call to depthSortAndCompact (overwrites pooled buffers)
  // - The next frame (pooled buffers are reused)
  //
  // Callers MUST copy the returned data before storing in any persistent structure.
  ```

**Usage:** Filters invisible instances, sorts by depth (painter's algorithm), compacts to contiguous arrays

---

### 1.3 Module-Level Pooled Buffers

**Location:** `src/runtime/RenderAssembler.ts:56-85`

```typescript
let pooledIndices: Uint32Array = new Uint32Array(INITIAL_POOL_CAPACITY);
let pooledScreenPos: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY * 2);
let pooledRadius: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY);
let pooledDepth: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY);
let pooledColor: Uint8ClampedArray = new Uint8ClampedArray(INITIAL_POOL_CAPACITY * 4);
let pooledRotation: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY);
let pooledScale2: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY * 2);
```

**Lifecycle:**
- Preallocated at module load (capacity 256)
- Grow 2x when capacity exceeded (line 76)
- Reused every frame without clearing
- Never shrink (conservative memory strategy)

**Why pooled:** Avoid per-frame allocations in hot loop

---

## Section 2: Call Site #1 - Single-Group Path

**Function:** `assembleDrawPathInstancesOp`  
**Location:** Lines 1200-1218

### Current Code (Before Refactoring)

```typescript
// Line 1200: Project instances
const projection = projectInstances(
  positionBuffer, 
  scale, 
  count, 
  context.resolvedCamera, 
  pool
);

// Line 1203: Depth-sort and compact
const compacted = depthSortAndCompact(
  projection, 
  count, 
  colorBuffer, 
  rotation, 
  scale2
);

// Lines 1210-1218: CRITICAL - Copy compacted buffers
const compactedCopy = {
  count: compacted.count,
  screenPosition: new Float32Array(compacted.screenPosition),
  screenRadius: new Float32Array(compacted.screenRadius),
  depth: new Float32Array(compacted.depth),
  color: new Uint8ClampedArray(compacted.color),
  rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
  scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
};
```

**Pattern:** Project → Compact → Copy (full pipeline)

**Context:**
- This is the "uniform shape" path (all instances have same topology)
- Called once per step (not in a loop)
- Uses BufferPool for intermediate allocations
- Optional `rotation` and `scale2` parameters

---

### Refactored Code (After)

```typescript
// Single call replaces 3-step pattern
const compactedCopy = projectAndCompact(
  positionBuffer,           // worldPositions
  scale,                    // worldRadius
  count,                    // count
  colorBuffer,              // color
  context.resolvedCamera,   // camera
  rotation,                 // optional rotation
  scale2,                   // optional scale2
  pool                      // optional pool
);
```

**Lines removed:** 1200-1218 (19 lines) → replaced with 1 call

**Benefit:** Eliminates 8 lines of duplicate copy logic + 2 intermediate variables

---

## Section 3: Call Site #2 - Multi-Group Path

**Function:** `assemblePerInstanceShapes`  
**Location:** Lines 780-846

### Current Code (Before Refactoring)

```typescript
// Line 780: Project FULL batch (once for all groups)
const projection = projectInstances(
  fullPosition, 
  scale, 
  count, 
  resolved, 
  pool
);

// Lines 782-846: For EACH topology group
for (const [key, group] of groups) {
  if (group.instanceIndices.length === 0) continue;

  // Lines 791-801: Slice color, rotation, scale2 for group
  const color = sliceColorBuffer(fullColor, group.instanceIndices);
  const rotation = fullRotation 
    ? sliceRotationBuffer(fullRotation, group.instanceIndices) 
    : undefined;
  const scale2 = fullScale2 
    ? sliceScale2Buffer(fullScale2, group.instanceIndices) 
    : undefined;

  // Lines 803-823: Slice projection outputs for group
  const groupScreenPos = new Float32Array(group.instanceIndices.length * 2);
  const groupScreenRadius = new Float32Array(group.instanceIndices.length);
  const groupDepth = new Float32Array(group.instanceIndices.length);
  const groupVisible = new Uint8Array(group.instanceIndices.length);

  for (let i = 0; i < group.instanceIndices.length; i++) {
    const srcIdx = group.instanceIndices[i];
    groupScreenPos[i * 2] = projection.screenPosition[srcIdx * 2];
    groupScreenPos[i * 2 + 1] = projection.screenPosition[srcIdx * 2 + 1];
    groupScreenRadius[i] = projection.screenRadius[srcIdx];
    groupDepth[i] = projection.depth[srcIdx];
    groupVisible[i] = projection.visible[srcIdx];
  }

  const groupProjection: ProjectionOutput = {
    screenPosition: groupScreenPos,
    screenRadius: groupScreenRadius,
    depth: groupDepth,
    visible: groupVisible,
  };

  // Line 826: Depth-sort and compact for THIS group
  const compacted = depthSortAndCompact(
    groupProjection,
    group.instanceIndices.length,
    color,
    rotation,
    scale2
  );

  // Lines 838-846: CRITICAL - Copy compacted buffers
  const compactedCopy = {
    count: compacted.count,
    screenPosition: new Float32Array(compacted.screenPosition),
    screenRadius: new Float32Array(compacted.screenRadius),
    depth: new Float32Array(compacted.depth),
    color: new Uint8ClampedArray(compacted.color),
    rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
    scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
  };

  // ... build DrawOp with compactedCopy
}
```

**Pattern:** Project once (full batch) → Loop over groups → Slice → Compact → Copy (per group)

**Context:**
- This is the "per-instance topology" path (each instance may have different shape)
- Projection happens ONCE for full batch (line 780)
- Compaction happens PER GROUP in loop (line 826)
- Copy logic is identical to single-group path

**Key insight:** We cannot use `projectAndCompact()` here because projection already happened. We need `compactAndCopy()` that just wraps compact + copy.

---

### Refactored Code (After)

```typescript
// Line 780: Project FULL batch (UNCHANGED)
const projection = projectInstances(fullPosition, scale, count, resolved, pool);

// Lines 782-846: For EACH topology group
for (const [key, group] of groups) {
  if (group.instanceIndices.length === 0) continue;

  // Lines 791-823: Slice and build groupProjection (UNCHANGED)
  const color = sliceColorBuffer(fullColor, group.instanceIndices);
  const rotation = fullRotation 
    ? sliceRotationBuffer(fullRotation, group.instanceIndices) 
    : undefined;
  const scale2 = fullScale2 
    ? sliceScale2Buffer(fullScale2, group.instanceIndices) 
    : undefined;

  const groupScreenPos = new Float32Array(group.instanceIndices.length * 2);
  const groupScreenRadius = new Float32Array(group.instanceIndices.length);
  const groupDepth = new Float32Array(group.instanceIndices.length);
  const groupVisible = new Uint8Array(group.instanceIndices.length);

  for (let i = 0; i < group.instanceIndices.length; i++) {
    const srcIdx = group.instanceIndices[i];
    groupScreenPos[i * 2] = projection.screenPosition[srcIdx * 2];
    groupScreenPos[i * 2 + 1] = projection.screenPosition[srcIdx * 2 + 1];
    groupScreenRadius[i] = projection.screenRadius[srcIdx];
    groupDepth[i] = projection.depth[srcIdx];
    groupVisible[i] = projection.visible[srcIdx];
  }

  const groupProjection: ProjectionOutput = {
    screenPosition: groupScreenPos,
    screenRadius: groupScreenRadius,
    depth: groupDepth,
    visible: groupVisible,
  };

  // REFACTORED: Single call replaces compact + copy
  const compactedCopy = compactAndCopy(
    groupProjection,              // projection
    group.instanceIndices.length, // count
    color,                        // color
    rotation,                     // optional rotation
    scale2                        // optional scale2
  );

  // ... build DrawOp with compactedCopy
}
```

**Lines changed:** 826-846 (21 lines) → replaced with 1 call

**Lines unchanged:** 780 (projection), 791-823 (slicing, groupProjection construction)

**Benefit:** Eliminates 8 lines of duplicate copy logic + 1 intermediate variable

---

## Section 4: Helper Function Signatures

### 4.1 `projectAndCompact()`

**Purpose:** High-level API for full pipeline (project → compact → copy)

**Use case:** Single-group path (uniform shapes), or any case where projection + compaction happen together

**Signature:**
```typescript
export function projectAndCompact(
  worldPositions: Float32Array,      // World-space positions (vec3 stride, READ-ONLY)
  worldRadius: number,                // Uniform world-space radius
  count: number,                      // Instance count
  color: Uint8ClampedArray,           // Per-instance RGBA colors
  camera: ResolvedCameraParams,       // Resolved camera parameters
  rotation?: Float32Array,            // Optional per-instance rotations
  scale2?: Float32Array,              // Optional per-instance anisotropic scale
  pool?: BufferPool,                  // Optional buffer pool for memory management
): {
  count: number;                      // Compacted count (visible only)
  screenPosition: Float32Array;       // OWNED copy
  screenRadius: Float32Array;         // OWNED copy
  depth: Float32Array;                // OWNED copy
  color: Uint8ClampedArray;           // OWNED copy
  rotation?: Float32Array;            // OWNED copy (if provided)
  scale2?: Float32Array;              // OWNED copy (if provided)
}
```

**Implementation:**
```typescript
export function projectAndCompact(
  worldPositions: Float32Array,
  worldRadius: number,
  count: number,
  color: Uint8ClampedArray,
  camera: ResolvedCameraParams,
  rotation?: Float32Array,
  scale2?: Float32Array,
  pool?: BufferPool,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation?: Float32Array;
  scale2?: Float32Array;
} {
  // Step 1: Project
  const projection = projectInstances(worldPositions, worldRadius, count, camera, pool);

  // Step 2: Compact & sort
  const compacted = depthSortAndCompact(projection, count, color, rotation, scale2);

  // Step 3: Copy all buffers (AUTOMATIC)
  return {
    count: compacted.count,
    screenPosition: new Float32Array(compacted.screenPosition),
    screenRadius: new Float32Array(compacted.screenRadius),
    depth: new Float32Array(compacted.depth),
    color: new Uint8ClampedArray(compacted.color),
    rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
    scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
  };
}
```

**Memory Contract:**
- Returns OWNED copies of all buffers
- Safe for persistent storage (e.g., in DrawOp)
- No need for caller to copy
- Pooled buffers are internal detail (hidden)

---

### 4.2 `compactAndCopy()`

**Purpose:** Mid-level API for compact + copy only (when projection already done)

**Use case:** Multi-group path where projection happens once, compaction per-group

**Signature:**
```typescript
export function compactAndCopy(
  projection: ProjectionOutput,       // Already-projected data
  count: number,                      // Instance count for this group
  color: Uint8ClampedArray,           // Per-instance RGBA colors
  rotation?: Float32Array,            // Optional per-instance rotations
  scale2?: Float32Array,              // Optional per-instance anisotropic scale
): {
  count: number;                      // Compacted count (visible only)
  screenPosition: Float32Array;       // OWNED copy
  screenRadius: Float32Array;         // OWNED copy
  depth: Float32Array;                // OWNED copy
  color: Uint8ClampedArray;           // OWNED copy
  rotation?: Float32Array;            // OWNED copy (if provided)
  scale2?: Float32Array;              // OWNED copy (if provided)
}
```

**Implementation:**
```typescript
export function compactAndCopy(
  projection: ProjectionOutput,
  count: number,
  color: Uint8ClampedArray,
  rotation?: Float32Array,
  scale2?: Float32Array,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation?: Float32Array;
  scale2?: Float32Array;
} {
  // Step 1: Compact & sort
  const compacted = depthSortAndCompact(projection, count, color, rotation, scale2);

  // Step 2: Copy all buffers (AUTOMATIC)
  return {
    count: compacted.count,
    screenPosition: new Float32Array(compacted.screenPosition),
    screenRadius: new Float32Array(compacted.screenRadius),
    depth: new Float32Array(compacted.depth),
    color: new Uint8ClampedArray(compacted.color),
    rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
    scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
  };
}
```

**Memory Contract:**
- Takes pre-projected data (from prior `projectInstances()` call)
- Returns OWNED copies of all buffers
- Safe for persistent storage
- No need for caller to copy

---

## Section 5: JSDoc Templates

### 5.1 `projectAndCompact()` JSDoc

```typescript
/**
 * Project world-space instances and depth-sort/compact in one step.
 *
 * This is the high-level API combining projectInstances() + depthSortAndCompact().
 * Returns OWNED copies of all buffers (safe for persistent storage).
 *
 * Preferred over manual projection + compaction for typical rendering use.
 *
 * **Use case:** Single-group path (uniform shapes), or any case where
 * projection and compaction happen together.
 *
 * **Memory contract:** Returns OWNED copies. Caller can store returned buffers
 * in DrawOps or other persistent structures without copying.
 *
 * **Low-level alternative:** For advanced use cases requiring projection without
 * compaction, or compaction without projection, use projectInstances() and
 * depthSortAndCompact() directly (and remember to copy the results).
 *
 * @param worldPositions - World-space positions (vec3 stride, READ-ONLY)
 * @param worldRadius - Uniform world-space radius
 * @param count - Instance count
 * @param color - Per-instance RGBA colors (stride 4)
 * @param camera - Resolved camera parameters (determines projection mode)
 * @param rotation - Optional per-instance rotations (will be copied)
 * @param scale2 - Optional per-instance anisotropic scale (will be copied)
 * @param pool - Buffer pool for intermediate allocation (optional, for memory management)
 * @returns All buffers as OWNED copies (safe for immediate storage in DrawOp)
 *
 * @example
 * ```typescript
 * const result = projectAndCompact(
 *   positions,     // Float32Array (vec3 stride)
 *   0.05,          // uniform radius
 *   instanceCount,
 *   colors,        // Uint8ClampedArray (RGBA stride)
 *   cameraParams,
 *   rotations,     // optional
 *   scales,        // optional
 *   bufferPool     // optional
 * );
 * // result.screenPosition, result.color, etc. are OWNED copies
 * ```
 */
```

---

### 5.2 `compactAndCopy()` JSDoc

```typescript
/**
 * Depth-sort, compact, and copy projection results in one step.
 *
 * This is a mid-level API for cases where projection has already been done
 * (e.g., multi-group path where projection happens once for full batch).
 * Returns OWNED copies of all buffers (safe for persistent storage).
 *
 * **Use case:** Multi-group path where projectInstances() is called once for
 * the full batch, then this function is called per-group to compact and copy.
 *
 * **Memory contract:** Returns OWNED copies. Caller can store returned buffers
 * without copying.
 *
 * **Comparison:**
 * - Use `projectAndCompact()` when you need projection + compaction together
 * - Use `compactAndCopy()` when projection is already done
 * - Use `depthSortAndCompact()` directly for low-level control (remember to copy)
 *
 * @param projection - Already-projected data (from projectInstances())
 * @param count - Instance count for this group
 * @param color - Per-instance RGBA colors (stride 4)
 * @param rotation - Optional per-instance rotations (will be copied)
 * @param scale2 - Optional per-instance anisotropic scale (will be copied)
 * @returns All buffers as OWNED copies (safe for immediate storage in DrawOp)
 *
 * @example
 * ```typescript
 * // Multi-group path
 * const projection = projectInstances(fullPositions, radius, totalCount, camera, pool);
 *
 * for (const group of groups) {
 *   const groupProjection = sliceProjection(projection, group.indices);
 *   const result = compactAndCopy(
 *     groupProjection,
 *     group.count,
 *     groupColors,
 *     groupRotations,
 *     groupScales
 *   );
 *   // result buffers are OWNED copies
 * }
 * ```
 */
```

---

## Section 6: Import Locations

### Files That Import from RenderAssembler

**Production code:**
- `src/runtime/RenderAssembler.ts` (self)
- `src/runtime/ScheduleExecutor.ts` (imports `assembleRenderFrame`)
- `src/ui/stores/AnimationStore.ts` (imports `assembleRenderFrame`)

**Test code:**
- `src/runtime/__tests__/level6-mode-toggle.test.ts`
- `src/runtime/__tests__/level7-depth-culling.test.ts`
- `src/runtime/__tests__/level9-continuity-decoupling.test.ts`

**Note:** None of these files need changes. Helpers are internal to RenderAssembler.

---

### Export Chain

**Current exports from RenderAssembler.ts:**
```typescript
export { projectInstances };
export { depthSortAndCompact };
export { assembleRenderFrame };
export type { ProjectionOutput, ProjectionMode, RenderFrameContext };
// ... other exports
```

**New exports (add these):**
```typescript
export { projectAndCompact };
export { compactAndCopy };
```

**Add to `src/runtime/index.ts`:**
```typescript
export { projectAndCompact, compactAndCopy } from './RenderAssembler';
```

**Verify re-export in `src/index.ts`:**
- Check if `src/index.ts` re-exports from `src/runtime`
- If yes, verify new helpers are transitively exported

---

## Section 7: Testing Context

### Existing Tests That Exercise Pattern

**Level 6 Tests (Mode Toggle):**
- `src/runtime/__tests__/level6-mode-toggle.test.ts`
- Uses `projectInstances()` only (no compaction)
- No changes needed

**Level 7 Tests (Depth Culling):**
- `src/runtime/__tests__/level7-depth-culling.test.ts`
- Uses both `projectInstances()` and `depthSortAndCompact()`
- 12 call sites (lines 66, 119, 150, 202, 229, 251, 253, 285, 315, 362, 376, 383)
- **Candidate for optional direct test** (use `projectAndCompact()` in one test)

**Level 9 Tests (Continuity):**
- `src/runtime/__tests__/level9-continuity-decoupling.test.ts`
- Uses both functions (lines 281, 304)
- No changes needed

**Integration Tests:**
- All runtime tests (`npm run test`) verify rendering correctness
- If refactoring is correct, all tests pass without modification

---

### Optional Test Addition (P5)

**Add to `level7-depth-culling.test.ts`:**

```typescript
it('projectAndCompact returns owned copies', () => {
  // Setup
  const N = 10;
  const positions = new Float32Array(N * 3);
  const color = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    positions[i * 3] = Math.random();
    positions[i * 3 + 1] = Math.random();
    positions[i * 3 + 2] = 0;
    color[i * 4] = 255; // R
    color[i * 4 + 3] = 255; // A
  }

  // Call helper
  const result = projectAndCompact(
    positions,
    0.03,                // uniform radius
    N,
    color,
    orthoCam,            // camera from fixture
    undefined,           // no rotation
    undefined            // no scale2
  );

  // Verify structure
  expect(result.count).toBeLessThanOrEqual(N);
  expect(result.screenPosition).toBeInstanceOf(Float32Array);
  expect(result.screenRadius).toBeInstanceOf(Float32Array);
  expect(result.depth).toBeInstanceOf(Float32Array);
  expect(result.color).toBeInstanceOf(Uint8ClampedArray);

  // Verify buffers are OWNED (not views)
  // (Hard to test directly, but verify length matches count)
  expect(result.screenPosition.length).toBe(result.count * 2);
  expect(result.screenRadius.length).toBe(result.count);
  expect(result.depth.length).toBe(result.count);
  expect(result.color.length).toBe(result.count * 4);
});
```

---

## Section 8: Memory Safety Checklist

### Why Copy Is Required

**Problem:** `depthSortAndCompact()` returns VIEWS into module-level pooled buffers.

**Consequences if not copied:**
1. Next call to `depthSortAndCompact()` overwrites pooled buffers
2. All previous views become INVALID (data corruption)
3. DrawOps would render garbage or crash

**Example:**
```typescript
// BAD: Storing views (BUG!)
const compacted1 = depthSortAndCompact(projection1, count1, color1);
const compacted2 = depthSortAndCompact(projection2, count2, color2);
// compacted1.screenPosition now contains data from projection2! (CORRUPTED)

// GOOD: Storing copies
const compacted1 = depthSortAndCompact(projection1, count1, color1);
const copy1 = { 
  screenPosition: new Float32Array(compacted1.screenPosition),
  // ... copy all fields
};
const compacted2 = depthSortAndCompact(projection2, count2, color2);
const copy2 = { 
  screenPosition: new Float32Array(compacted2.screenPosition),
  // ... copy all fields
};
// Both copy1 and copy2 are valid and independent
```

---

### How Helpers Enforce Safety

**Helpers auto-copy:**
- `projectAndCompact()` calls `depthSortAndCompact()` internally, then copies
- `compactAndCopy()` calls `depthSortAndCompact()` internally, then copies
- Returned buffers are OWNED by caller (no risk of corruption)

**Advantage:** Caller cannot forget to copy (enforced by helper)

**Trade-off:** Adds allocation overhead (6 typed arrays per call)
- But existing code already copies, so net overhead is ZERO

---

### Verification Strategy

**During refactoring:**
- Compare copy blocks line-by-line (must be identical)
- Verify all buffer types are copied correctly:
  - `Float32Array` → `new Float32Array()`
  - `Uint8ClampedArray` → `new Uint8ClampedArray()`
  - Optional fields → conditional copy: `field ? new Float32Array(field) : undefined`

**After refactoring:**
- Run full test suite (verify no regressions)
- Visual inspection (verify rendering is identical)
- Memory profiler (verify no leaks, allocation count unchanged)

---

## Section 9: Line-by-Line Refactoring Guide

### Step-by-Step for Call Site #1 (Single-Group)

**Location:** `assembleDrawPathInstancesOp` (lines 1200-1218)

**Before:**
```typescript
1200: const projection = projectInstances(positionBuffer, scale, count, context.resolvedCamera, pool);
1201: 
1202: // Depth-sort and compact: remove invisible instances, sort by depth (far-to-near / painter's algorithm)
1203: const compacted = depthSortAndCompact(projection, count, colorBuffer, rotation, scale2);
1204: 
1205: // CRITICAL: Copy compacted buffers to prevent memory leak.
1206: // depthSortAndCompact returns views into module-level pooled buffers.
1207: // If we store these views in DrawOp, they become invalid on next frame
1208: // when the pooled buffers are reused. This matches the multi-group path
1209: // at lines 830-838.
1210: const compactedCopy = {
1211:   count: compacted.count,
1212:   screenPosition: new Float32Array(compacted.screenPosition),
1213:   screenRadius: new Float32Array(compacted.screenRadius),
1214:   depth: new Float32Array(compacted.depth),
1215:   color: new Uint8ClampedArray(compacted.color),
1216:   rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
1217:   scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
1218: };
```

**After:**
```typescript
1200: // Project, compact, and copy in one step (helper enforces memory safety)
1201: const compactedCopy = projectAndCompact(
1202:   positionBuffer,         // worldPositions
1203:   scale,                  // worldRadius
1204:   count,                  // count
1205:   colorBuffer,            // color
1206:   context.resolvedCamera, // camera
1207:   rotation,               // optional rotation
1208:   scale2,                 // optional scale2
1209:   pool                    // optional pool
1210: );
```

**Result:** 19 lines → 10 lines (9 lines saved)

---

### Step-by-Step for Call Site #2 (Multi-Group)

**Location:** `assemblePerInstanceShapes` (lines 826-846)

**Before:**
```typescript
826: const compacted = depthSortAndCompact(
827:   groupProjection,
828:   group.instanceIndices.length,
829:   color,
830:   rotation,
831:   scale2
832: );
833: 
834: // IMPORTANT: Copy compacted buffers when multiple groups are processed.
835: // depthSortAndCompact returns views into module-level pooled buffers.
836: // Since we call it for each group, we must copy to avoid data corruption
837: // when the pooled buffer is reused for the next group.
838: const compactedCopy = {
839:   count: compacted.count,
840:   screenPosition: new Float32Array(compacted.screenPosition),
841:   screenRadius: new Float32Array(compacted.screenRadius),
842:   depth: new Float32Array(compacted.depth),
843:   color: new Uint8ClampedArray(compacted.color),
844:   rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
845:   scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
846: };
```

**After:**
```typescript
826: // Compact and copy in one step (projection already done at line 780)
827: const compactedCopy = compactAndCopy(
828:   groupProjection,              // projection
829:   group.instanceIndices.length, // count
830:   color,                        // color
831:   rotation,                     // optional rotation
832:   scale2                        // optional scale2
833: );
```

**Result:** 21 lines → 8 lines (13 lines saved)

---

## Section 10: Related Files

**Do NOT modify:**
- `src/runtime/BufferPool.ts` (no changes needed)
- `src/runtime/ScheduleExecutor.ts` (no changes needed)
- `src/runtime/__tests__/*.test.ts` (should pass without modification)
- `src/ui/stores/AnimationStore.ts` (no changes needed)

**DO modify:**
- `src/runtime/RenderAssembler.ts` (add helpers, refactor call sites)
- `src/runtime/index.ts` (add exports)

**Verify exports:**
- `src/index.ts` (if it re-exports from runtime)

---

## Summary

This context document provides all code snippets, signatures, and line-by-line guidance needed to implement the refactoring. The work is straightforward:

1. **P0/P1:** Add two helper functions (copy logic from existing call sites)
2. **P2/P3:** Replace call sites with helpers (delete intermediate variables)
3. **P4:** Export helpers
4. **P5:** Verify tests pass

**Key principle:** Copy logic is IDENTICAL to existing code. This is a pure refactoring with zero functional changes.
