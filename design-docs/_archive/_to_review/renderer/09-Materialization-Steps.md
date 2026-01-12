# Materialization Steps Specification

**Status:** Preparatory (Phase B)
**Implementation:** Phase C-D
**Related:** Doc 04 (Decision-to-IR), Doc 05 (Upstream Impacts)

## Overview

Color quantization and path flattening are **not renderer responsibilities**. They are explicit, cacheable materialization steps in the schedule that convert authoring-time values (float colors, curve-based paths) into storage-time buffers (u8x4 colors, command streams).

This document specifies the contracts for MaterializeColor and MaterializePath schedule step types, preparing the foundation for Phase C-D implementation.

## Why Materialization is a Scheduled Step

### The Problem
If materialization happens "inside the renderer":
- Cannot cache materialized buffers independently
- Cannot attribute costs in debugger (why did we allocate 3MB this frame?)
- Cannot hot-swap renderers without re-materializing
- Materialization logic duplicated across renderer implementations

### The Solution
Materialization becomes a first-class scheduled step:
- **Explicit**: appears in ScheduleIR with inputs, outputs, cache keys
- **Cacheable**: same inputs + policy → reuse materialized buffer
- **Observable**: debugger shows "MaterializeColor: 2.3ms, 40KB allocated, cache hit"
- **Portable**: Rust/WASM/TS runtimes all use the same step contract

## Step Type: MaterializeColor

Converts field&lt;color&gt; or signal&lt;color&gt; values to u8x4 premultiplied linear RGBA buffer.

### Contract

```typescript
interface MaterializeColorStep {
  kind: 'MaterializeColor';

  // Inputs
  sourceSlot: ValueSlotRef;        // Points to field<color> or signal<color>
  instanceCount?: number;          // For field: how many instances to materialize

  // Outputs
  bufferSlot: ValueSlotRef;        // Where to store the u8x4 buffer
  bufferDesc: ColorBufferDesc;     // Always canonical (u8x4 linear premul)

  // Cache policy
  cacheKey?: CacheKeySpec;         // Optional: enables caching

  // Debug/instrumentation
  debugLabel?: string;             // For performance attribution
}
```

### Execution Semantics

**For signal&lt;color&gt;:**
1. Evaluate source signal at current time `t`
2. Get RGBA float value (0-1 range)
3. Call `quantizeColorRGBA()` kernel
4. Write result to bufferSlot (Uint8Array of length 4)

**For field&lt;color&gt;:**
1. Materialize field for `instanceCount` instances (get float RGBA array)
2. Call `quantizeColorRGBABatch()` kernel
3. Write result to bufferSlot (Uint8Array of length `instanceCount * 4`)

**Caching:**
- If `cacheKey` is present, check cache before evaluating source
- Cache key includes: sourceExprId, encoding (always linear_premul_rgba8), instanceCount
- On cache hit: copy cached buffer to bufferSlot, skip evaluation
- On cache miss: evaluate, quantize, store in cache

### Performance Counters

Each MaterializeColor step emits:
- `cpuMs`: Time spent in quantization kernel
- `bytesWritten`: Size of materialized buffer (instanceCount * 4)
- `cacheHit`: Boolean, true if buffer was reused from cache
- `sourceEvalMs`: Time spent evaluating source expression (separate from quantization)

### Why Materialization is NOT in the Renderer

The Canvas2D renderer receives **already-quantized** u8x4 buffers. It never sees float colors.

This means:
- Renderer can be "dumb fast" (just unpack bytes and draw)
- Color quantization is cached once, shared by multiple render passes
- Export pipeline can request different encodings (f32x4 for HDR, u8x4 for video)
- Future WebGPU renderer can use the same materialized buffers

## Step Type: MaterializePath

Converts path expressions to PathCommandStream buffers with optional flattening.

### Contract

```typescript
interface MaterializePathStep {
  kind: 'MaterializePath';

  // Inputs
  sourceSlot: ValueSlotRef;         // Points to path expression
  flattenPolicy: FlattenPolicy;     // Off (keep curves) or on (canonical tolerance)

  // Outputs
  commandsSlot: ValueSlotRef;       // Where to store Uint16Array of commands
  pointsSlot: ValueSlotRef;         // Where to store Float32Array of points (x,y,x,y,...)
  commandDesc: PathCommandStreamDesc; // Always canonical (u16, LE)

  // Cache policy
  cacheKey?: CacheKeySpec;          // Optional: enables caching

  // Debug/instrumentation
  debugLabel?: string;
}
```

### Execution Semantics

**Without flattening (curves preserved):**
1. Evaluate source path expression
2. Extract curve commands (MoveTo, LineTo, QuadTo, CubicTo, Close)
3. Encode commands to Uint16Array with canonical opcode values
4. Pack control points to Float32Array
5. Write to commandsSlot and pointsSlot

**With flattening (canonical tolerance):**
1. Evaluate source path expression
2. Flatten curves to polylines using `flattenPathKernel()` (Phase D implementation)
3. Tolerance = CANONICAL_FLATTEN_TOL_PX (0.75px in screen space)
4. Encode flattened commands (only MoveTo, LineTo, Close)
5. Pack polyline vertices to Float32Array

**Caching:**
- Cache key includes: sourceExprId, flattenPolicy (off or on-0.75px), viewport/DPR (if flattened)
- View-dependence: flattened paths are cached per-viewport (accepted tradeoff)
- Non-flattened paths are viewport-independent (better cache hit rate)

### Performance Counters

Each MaterializePath step emits:
- `cpuMs`: Time spent in path encoding/flattening
- `bytesCommands`: Size of command buffer (Uint16Array)
- `bytesPoints`: Size of points buffer (Float32Array)
- `cacheHit`: Boolean, true if buffers were reused from cache
- `flattenedSegments`: Number of polyline segments generated (if flattened)

## Cache Key Requirements

Materialization steps produce deterministic output based on:

**MaterializeColor:**
- Source expression ID (which color expression)
- Encoding (always `linear_premul_rgba8` for now)
- Instance count (for field materialization)
- Time `t` (for signal, if not cached per-frame)

**MaterializePath:**
- Source expression ID (which path expression)
- Flatten policy (off or on-canonical)
- Viewport/DPR (if flattened, since tolerance is screen-space)
- Command descriptor (always u16 LE for now)

**Cache invalidation:**
- If source expression changes (patch edit), cache is invalidated
- If viewport changes and path is flattened, cache is invalidated
- Hot-swap continuity: same ExprId + same policy → reuse cached buffer

## Integration with ScheduleIR

Materialization steps appear in the schedule between "evaluate expressions" and "render":

```
ScheduleIR:
  1. TimeRoot.eval                  // Compute time signals
  2. NodeEval (upstream blocks)     // Evaluate patch expressions
  3. MaterializeColor (step)        // Quantize colors
  4. MaterializePath (step)         // Encode/flatten paths
  5. AssembleInstanceBuffers (step) // Pack instance data
  6. RenderInstances2D (step)       // Canvas2D draw calls
```

This ordering ensures:
- Materialization can be cached before rendering
- Debugger sees materialization as separate from rendering
- Multiple renderers can share the same materialized buffers

## Future Extensions

**Phase C-D (immediate):**
- Implement MaterializeColor for instances2d
- Implement MaterializePath for paths2d
- Add cache hit/miss tracking

**Phase E (caching):**
- Implement CacheKeySpec with encoding/policy fields
- Add cache statistics to debugger UI

**Phase G-H (3D):**
- MaterializeMesh step (extrude simple shapes to triangle buffers)
- MaterializeNormals step (compute lighting normals)

**Future optimizations:**
- SIMD color quantization (if benchmarks show need)
- GPU compute for path flattening (for very heavy paths)
- Incremental materialization (dirty range updates)

## Why This Matters

Materialization as scheduled steps enables:
1. **Determinism**: Same inputs → same bytes (cacheable, debuggable)
2. **Portability**: TS/Rust/WASM use same step contracts
3. **Debuggability**: "Why is this slow?" → "MaterializeColor took 15ms"
4. **Hot-swap**: Change renderer without re-materializing
5. **Export**: Request different encodings for different outputs

Without this separation, we'd have:
- Encoding logic scattered across blocks/renderer
- No caching (re-quantize every frame)
- No way to debug materialization costs
- Renderer-specific encoding hacks

---

**Phase C-D Implementation:** Build these step types and integrate with ScheduleExecutor.
