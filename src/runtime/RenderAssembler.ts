/**
 * RenderAssembler - Render Frame Assembly
 *
 * Assembles RenderFrameIR from schedule execution results.
 * This module is the single point where IR references become concrete render data.
 *
 * ARCHITECTURAL PURPOSE (from 8-before-render.md):
 * 1. Resolve field references via Materializer for every field the pass needs
 * 2. Resolve scalar references by reading scalar slot banks directly
 * 3. Resolve shape2d → (topologyId, pointsBuffer, flags/style)
 * 4. Emit render passes that are already normalized
 *
 * This is where we enforce the invariant "Renderer is sink-only."
 *
 * Assembles RenderFrameIR using DrawOp operations (v2 format).
 * Produces DrawPathInstancesOp and DrawPrimitiveInstancesOp (see types.ts)
 */

import type { StepRender, InstanceDecl } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef, TopologyDef, TopologyId } from '../shapes/types';
import type {
  DrawPathInstancesOp,
  DrawPrimitiveInstancesOp,
  DrawOp,
  PathGeometry,
  PrimitiveGeometry,
  InstanceTransforms,
  PathStyle,
  RenderFrameIR,
} from '../render/types';
import { SHAPE2D_WORDS, Shape2DWord, type Shape2DRecord, readShape2D } from './RuntimeState';
import type { ValueSlot } from '../types';
import {
  projectFieldOrtho,
  projectFieldRadiusOrtho,
  ORTHO_CAMERA_DEFAULTS,
} from '../projection/ortho-kernel';
import { hslToRgbScalar } from './color-math';
import {
  projectFieldPerspective,
  projectFieldRadiusPerspective,
  deriveCamPos,
} from '../projection/perspective-kernel';
import type { ResolvedCameraParams } from './CameraResolver';

// =============================================================================
// RenderBufferArena Integration
// =============================================================================
// All render pipeline allocations go through the RenderBufferArena.
// After initialization, NO allocations occur during rendering.
// Any attempt to exceed arena capacity throws an error (fail-fast).

import type { RenderBufferArena } from '../render/RenderBufferArena';

// =============================================================================
// Cached Topology Verbs (avoid per-frame Uint8Array allocation)
// =============================================================================

/**
 * Cache topology.verbs (readonly PathVerb[]) → Uint8Array conversions.
 * Topology verbs are static — no need to copy every frame.
 */
const _topologyVerbsCache = new Map<TopologyId, Uint8Array>();

function getCachedVerbs(topology: PathTopologyDef): Uint8Array {
  let cached = _topologyVerbsCache.get(topology.id);
  if (!cached) {
    cached = new Uint8Array(topology.verbs);
    _topologyVerbsCache.set(topology.id, cached);
  }
  return cached;
}

// =============================================================================
// Internal Types (v1 compatibility)
// =============================================================================

/**
 * Shape descriptor with topology ID and parameter values
 * @internal Used by shape resolution helpers
 */
interface ShapeDescriptor {
  topologyId: TopologyId;
  params: Record<string, number>;
}

/**
 * Fully resolved shape data for rendering
 * @internal Used by shape resolution helpers
 */
interface ResolvedShape {
  resolved: true;
  topologyId: TopologyId;
  mode: 'path' | 'primitive';
  params: Record<string, number>;
  verbs?: Uint8Array;
  controlPoints?: ArrayBufferView;
}

// =============================================================================
// Projection Types
// =============================================================================

/**
 * Projection mode derived from ResolvedCameraParams.projection.
 */
export type ProjectionMode = 'ortho' | 'persp';

/**
 * Projection output for a set of instances.
 * Separate buffers — world-space inputs are never mutated.
 */
export interface ProjectionOutput {
  /** Screen-space positions (Float32Array, stride 2, normalized [0,1]) */
  screenPosition: Float32Array;
  /** Per-instance screen-space radius */
  screenRadius: Float32Array;
  /** Per-instance depth (Float32Array, length N) */
  depth: Float32Array;
  /** Per-instance visibility (Uint8Array, length N, 1=visible 0=culled) */
  visible: Uint8Array;
}

/**
 * Depth-sort and compact projection output.
 *
 * Removes invisible instances and sorts visible ones by depth (far-to-near / painter's algorithm, stable).
 * Returns compacted arrays with only visible instances.
 *
 * Fast-path optimization: if depth is already monotone decreasing among visible instances, skip sort.
 *
 * MEMORY CONTRACT:
 * Returned buffers are VIEWS into the arena. They are valid until arena.reset() is called.
 * Callers should use the returned views directly in DrawOps - no copying needed.
 *
 * @param projection - Raw projection output with all instances
 * @param count - Total instance count (including invisible)
 * @param color - Per-instance color buffer (Uint8ClampedArray, stride 4: RGBA)
 * @param arena - Pre-allocated buffer arena (required)
 * @param rotation - Optional per-instance rotation
 * @param scale2 - Optional per-instance anisotropic scale
 * @returns Compacted output with only visible instances, depth-sorted
 */
export function depthSortAndCompact(
  projection: ProjectionOutput,
  count: number,
  color: Uint8ClampedArray,
  arena: RenderBufferArena,
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
  const { screenPosition, screenRadius, depth, visible } = projection;

  // Allocate index buffer from arena
  const indices = arena.allocU32(count);

  // Build index array for visible instances
  let visibleCount = 0;
  for (let i = 0; i < count; i++) {
    if (visible[i] === 1) {
      indices[visibleCount++] = i;
    }
  }

  // Fast-path: check if depth is already monotone decreasing (far-to-near)
  // Common case: flat layouts (all z=0) or already-ordered scenes
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

  // Only sort if not already ordered
  if (!alreadyOrdered) {
    // In-place insertion sort (allocation-free, stable, O(n²) but fast for small n)
    // For large arrays this is slower than Array.sort but avoids allocation
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
  }

  // Allocate output buffers from arena
  const outScreenPos = arena.allocVec2(visibleCount);
  const outRadius = arena.allocF32(visibleCount);
  const outDepth = arena.allocF32(visibleCount);
  const outColor = arena.allocRGBA(visibleCount);

  // Compact screen-space arrays
  for (let out = 0; out < visibleCount; out++) {
    const src = indices[out];
    outScreenPos[out * 2] = screenPosition[src * 2];
    outScreenPos[out * 2 + 1] = screenPosition[src * 2 + 1];
    outRadius[out] = screenRadius[src];
    outDepth[out] = depth[src];
  }

  // Compact color buffer (stride 4: RGBA)
  for (let out = 0; out < visibleCount; out++) {
    const src = indices[out];
    const o = out * 4;
    const s = src * 4;
    outColor[o] = color[s];
    outColor[o + 1] = color[s + 1];
    outColor[o + 2] = color[s + 2];
    outColor[o + 3] = color[s + 3];
  }

  // Compact rotation if present
  let compactedRotation: Float32Array | undefined;
  if (rotation) {
    compactedRotation = arena.allocF32(visibleCount);
    for (let out = 0; out < visibleCount; out++) {
      compactedRotation[out] = rotation[indices[out]];
    }
  }

  // Compact scale2 if present (stride 2)
  let compactedScale2: Float32Array | undefined;
  if (scale2) {
    compactedScale2 = arena.allocVec2(visibleCount);
    for (let out = 0; out < visibleCount; out++) {
      const src = indices[out];
      compactedScale2[out * 2] = scale2[src * 2];
      compactedScale2[out * 2 + 1] = scale2[src * 2 + 1];
    }
  }

  return {
    count: visibleCount,
    screenPosition: outScreenPos,
    screenRadius: outRadius,
    depth: outDepth,
    color: outColor,
    rotation: compactedRotation,
    scale2: compactedScale2,
  };
}

/**
 * Project world-space instances to screen-space.
 *
 * This is the projection stage called by the RenderAssembler.
 * World-space buffers are READ-ONLY — output is written to separate buffers.
 * Camera params come from the frame globals resolver (ResolvedCameraParams).
 *
 * For most use cases, prefer the high-level helper `projectAndCompact()` which combines
 * projection + compaction + copying in one step.
 *
 * @param worldPositions - World-space vec3 positions (Float32Array, stride 3). READ-ONLY.
 * @param worldRadius - Uniform world-space radius for all instances
 * @param count - Number of instances
 * @param resolved - Resolved camera parameters from frame globals
 * @param arena - Pre-allocated buffer arena (required)
 * @returns Separate screen-space output buffers
 */
export function projectInstances(
  worldPositions: Float32Array,
  worldRadius: number,
  count: number,
  resolved: ResolvedCameraParams,
  arena: RenderBufferArena,
): ProjectionOutput {
  // Allocate output buffers from arena (zero allocations after init)
  const screenPosition = arena.allocVec2(count);
  const screenRadius = arena.allocF32(count);
  const depth = arena.allocF32(count);
  const visible = arena.allocU8(count);

  // Uniform radii input for field radius projection
  const worldRadii = arena.allocF32(count);
  worldRadii.fill(worldRadius);

  if (resolved.projection === 'ortho') {
    projectFieldOrtho(worldPositions, count, ORTHO_CAMERA_DEFAULTS, screenPosition, depth, visible);
    projectFieldRadiusOrtho(worldRadii, worldPositions, count, ORTHO_CAMERA_DEFAULTS, screenRadius);
  } else {
    // Derive kernel params from ResolvedCameraParams
    const [camPosX, camPosY, camPosZ] = deriveCamPos(
      resolved.centerX, resolved.centerY, 0, // camera target = (centerX, centerY, 0) in world
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
    projectFieldRadiusPerspective(worldRadii, worldPositions, count, perspParams, screenRadius);
  }

  return { screenPosition, screenRadius, depth, visible };
}

/**
 * Project world-space instances and depth-sort/compact in one step.
 *
 * This is the high-level API combining projectInstances() + depthSortAndCompact().
 * Returns views into the arena (valid until arena.reset()).
 *
 * Preferred over manual projection + compaction for typical rendering use.
 *
 * **Use case:** Single-group path (uniform shapes), or any case where
 * projection and compaction happen together.
 *
 * **Memory contract:** Returns arena views. Valid until arena.reset() at end of frame.
 *
 * @param worldPositions - World-space positions (vec3 stride, READ-ONLY)
 * @param worldRadius - Uniform world-space radius
 * @param count - Instance count
 * @param color - Per-instance RGBA colors (stride 4)
 * @param camera - Resolved camera parameters (determines projection mode)
 * @param arena - Pre-allocated buffer arena (required)
 * @param rotation - Optional per-instance rotations
 * @param scale2 - Optional per-instance anisotropic scale
 * @returns All buffers as arena views (valid until arena.reset())
 */
export function projectAndCompact(
  worldPositions: Float32Array,
  worldRadius: number,
  count: number,
  color: Uint8ClampedArray,
  camera: ResolvedCameraParams,
  arena: RenderBufferArena,
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
  // Step 1: Project
  const projection = projectInstances(worldPositions, worldRadius, count, camera, arena);

  // Step 2: Compact & sort (returns arena views directly)
  return depthSortAndCompact(projection, count, color, arena, rotation, scale2);
}

/**
 * Depth-sort and compact projection results in one step.
 *
 * This is a mid-level API for cases where projection has already been done
 * (e.g., multi-group path where projection happens once for full batch).
 *
 * **Use case:** Multi-group path where projectInstances() is called once for
 * the full batch, then this function is called per-group to compact.
 *
 * **Memory contract:** Returns arena views. Valid until arena.reset() at end of frame.
 *
 * @param projection - Already-projected data (from projectInstances())
 * @param count - Instance count for this group
 * @param color - Per-instance RGBA colors (stride 4)
 * @param arena - Pre-allocated buffer arena (required)
 * @param rotation - Optional per-instance rotations
 * @param scale2 - Optional per-instance anisotropic scale
 * @returns Arena views (valid until arena.reset())
 */
export function compactAndCopy(
  projection: ProjectionOutput,
  count: number,
  color: Uint8ClampedArray,
  arena: RenderBufferArena,
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
  // Compact & sort (returns arena views directly)
  return depthSortAndCompact(projection, count, color, arena, rotation, scale2);
}

/**
 * AssemblerContext - Context needed for render assembly
 */
export interface AssemblerContext {
  /** Instance declarations */
  instances: ReadonlyMap<string, InstanceDecl>;
  /** Runtime state for reading signal slots and field buffers */
  state: RuntimeState;
  /** Resolved camera params from frame globals (always present, defaults if no Camera block) */
  resolvedCamera: ResolvedCameraParams;
  /** Pre-allocated buffer arena for zero-allocation rendering */
  arena: RenderBufferArena;
  /** Signal ValueExprId -> physical f64 offset mapping (from schedule slotMeta.offset) */
  sigToSlot: ReadonlyMap<number, number>;
}

/**
 * Resolve scale from step specification
 *
 * Scale is a uniform multiplier for shape dimensions.
 * MUST be provided - no fallback values in render pipeline.
 */
function resolveScale(
  scaleSpec: StepRender['scale'],
  sigToSlot: ReadonlyMap<number, number>,
  state: RuntimeState
): number {
  if (scaleSpec === undefined) {
    throw new Error(
      'RenderAssembler: scale is required. ' +
      'Ensure RenderInstances2D block has a scale input (default 1.0 from registry).'
    );
  }

  if (scaleSpec.k === 'sig') { // TODO: k === 'sig' is deprecated/removed
    const slotIndex = sigToSlot.get(scaleSpec.id as number);
    if (slotIndex === undefined) {
      throw new Error(
        `RenderAssembler: No slot mapping for signal ${scaleSpec.id}. ` +
        'Signal must be evaluated in schedule before rendering.'
      );
    }
    return state.values.f64[slotIndex];
  } else {
    throw new Error(
      `RenderAssembler: scale must be a signal, got ${scaleSpec.k}. ` +
      'Per-particle scale is not supported.' // TODO: why?
    );
  }
}

/**
 * Resolve shape from step specification
 *
 * Returns ShapeDescriptor for topology-based shapes.
 * Returns ArrayBufferView for per-particle shapes (not yet fully supported).
 *
 * MUST be provided - no fallback values in render pipeline.
 * NO LEGACY NUMERIC ENCODING - all shapes use proper topology IDs.
 */
function resolveShape(
  shapeSpec: StepRender['shape'],
  sigToSlot: ReadonlyMap<number, number>,
  state: RuntimeState
): ShapeDescriptor | ArrayBufferView {
  if (shapeSpec === undefined) {
    throw new Error(
      'RenderAssembler: shape is required. ' +
      'Ensure a shape block (Ellipse, Rect, etc.) is wired to the render pipeline.'
    );
  }

  if (shapeSpec.k === 'slot') {
    const shapeBuffer = state.values.objects.get(shapeSpec.slot) as ArrayBufferView;
    if (!shapeBuffer) {
      throw new Error(`RenderAssembler: Shape buffer not found in slot ${shapeSpec.slot}`);
    }
    return shapeBuffer;
  } else {
    // Signal ('sig') with topology - resolve param signals from slots
    const { topologyId, paramSignals } = shapeSpec;
    const params: Record<string, number> = {};

    for (let i = 0; i < paramSignals.length; i++) {
      const slotIndex = sigToSlot.get(paramSignals[i] as number);
      if (slotIndex === undefined) {
        throw new Error(
          `RenderAssembler: No slot mapping for param signal ${paramSignals[i]}. ` +
          'Signal must be evaluated in schedule before rendering.'
        );
      }
      const value = state.values.f64[slotIndex];
      params[`param${i}`] = value;
    }

    return {
      topologyId,
      params,
    };
  }
}

/**
 * Resolve control points from step specification
 */
function resolveControlPoints(
  cpSpec: StepRender['controlPoints'],
  state: RuntimeState
): ArrayBufferView | undefined {
  if (!cpSpec) {
    return undefined;
  }

  const cpBuffer = state.values.objects.get(cpSpec.slot) as ArrayBufferView;
  if (!cpBuffer) {
    throw new Error(`RenderAssembler: Control points buffer not found in slot ${cpSpec.slot}`);
  }
  return cpBuffer;
}

/**
 * Type guard for PathTopologyDef
 */
export function isPathTopology(topology: TopologyDef): topology is PathTopologyDef {
  return 'verbs' in topology;
}

/**
 * Type guard for ShapeDescriptor
 */
function isShapeDescriptor(
  shape: ShapeDescriptor | ArrayBufferView | number
): shape is ShapeDescriptor {
  return typeof shape === 'object' && 'topologyId' in shape && 'params' in shape;
}

/**
 * Fully resolve shape for renderer
 *
 * This performs the topology lookup and param mapping that was previously
 * done in the renderer. Now the renderer receives pre-resolved data.
 *
 * NO LEGACY NUMERIC ENCODING - all shapes must be proper ShapeDescriptor.
 *
 * @param shape - Shape descriptor or per-particle buffer
 * @param controlPoints - Optional control points for path shapes
 * @returns ResolvedShape for renderer
 */
function resolveShapeFully(
  shape: ShapeDescriptor | ArrayBufferView,
  controlPoints?: ArrayBufferView
): ResolvedShape {
  // Per-particle shape buffer (Field<shape>) - not yet implemented
  if (!isShapeDescriptor(shape)) {
    throw new Error(
      'Per-particle shapes (Field<shape>) are not yet implemented. ' +
      'Use a uniform shape signal (Signal<shape>) instead.'
    );
  }

  // ShapeDescriptor - look up topology and resolve params
  const topology = getTopology(shape.topologyId);

  // Map param indices to param names from topology definition
  const params: Record<string, number> = {};
  topology.params.forEach((paramDef, i) => {
    const value = shape.params[`param${i}`];
    if (value !== undefined) {
      params[paramDef.name] = value;
    } else {
      // Use default if param not provided
      params[paramDef.name] = paramDef.default;
    }
  });

  if (isPathTopology(topology)) {
    // Path topology - requires control points
    return {
      resolved: true,
      topologyId: shape.topologyId,
      mode: 'path',
      params,
      verbs: getCachedVerbs(topology),
      controlPoints,
    };
  } else {
    // Primitive topology (ellipse, rect, etc.)
    return {
      resolved: true,
      topologyId: shape.topologyId,
      mode: 'primitive',
      params,
    };
  }
}

/**
 * Type guard: Check if a step is a render step
 */
export function isRenderStep(step: { kind: string }): step is StepRender {
  return step.kind === 'render';
}

// ============================================================================
// V2 RENDER ASSEMBLY - DrawPathInstancesOp and DrawPrimitiveInstancesOp
// ============================================================================

/**
 * TopologyGroup - Instances grouped by topology identity
 *
 * Instances with the same topology and control points buffer can be
 * rendered together in a single DrawPathInstancesOp for efficiency.
 */
interface TopologyGroup {
  /** Numeric topology ID */
  topologyId: number;
  /** Control points buffer slot */
  controlPointsSlot: number;
  /** Number of control points */
  pointsCount: number;
  /** Flags bitfield (closed, fill, etc.) */
  flags: number;
  /** Indices of instances in this group */
  instanceIndices: number[];
}

/**
 * Topology group cache - WeakMap keyed on shape buffer identity
 *
 * Why WeakMap:
 * - Key is the buffer object itself (identity-based)
 * - Same buffer reference = same content (materializer reuses refs for unchanged fields)
 * - Buffer GC'd → cache entry automatically cleaned
 * - No manual invalidation logic needed
 */
const topologyGroupCache = new WeakMap<
  Uint32Array,
  { count: number; groups: Map<string, TopologyGroup> }
>();

/** Cache hit/miss counters - read by instrumentation */
export let topologyGroupCacheHits = 0;
export let topologyGroupCacheMisses = 0;

/** Reset cache counters (for snapshot windows) */
export function resetTopologyCacheCounters(): void {
  topologyGroupCacheHits = 0;
  topologyGroupCacheMisses = 0;
}

/**
 * Group instances by topology identity (cached)
 *
 * Cache hit: same buffer reference AND same count → reuse (zero allocations).
 * Cache miss: different buffer or different count → recompute and store.
 *
 * @param shapeBuffer - Packed Shape2D buffer (Uint32Array)
 * @param instanceCount - Number of instances
 * @returns Map of topology groups keyed by "topologyId:controlPointsSlot"
 */
export function groupInstancesByTopology(
  shapeBuffer: Uint32Array,
  instanceCount: number
): Map<string, TopologyGroup> {
  const cached = topologyGroupCache.get(shapeBuffer);
  if (cached && cached.count === instanceCount) {
    topologyGroupCacheHits++;
    return cached.groups;
  }

  topologyGroupCacheMisses++;
  const groups = computeTopologyGroups(shapeBuffer, instanceCount);
  topologyGroupCache.set(shapeBuffer, { count: instanceCount, groups });
  return groups;
}

/**
 * Compute topology groups (inner logic, uncached)
 *
 * Single-pass O(N) grouping algorithm. Instances with the same topology
 * and control points buffer are grouped together for batched rendering.
 *
 * @param shapeBuffer - Packed Shape2D buffer (Uint32Array)
 * @param instanceCount - Number of instances
 * @returns Map of topology groups keyed by "topologyId:controlPointsSlot"
 */
export function computeTopologyGroups(
  shapeBuffer: Uint32Array,
  instanceCount: number
): Map<string, TopologyGroup> {
  // Validate buffer length at pass level (not per-instance)
  const expectedLength = instanceCount * SHAPE2D_WORDS;
  if (shapeBuffer.length < expectedLength) {
    throw new Error(
      `RenderAssembler: Shape buffer length mismatch. ` +
      `Expected >=${expectedLength} (${instanceCount} instances × ${SHAPE2D_WORDS} words), ` +
      `got ${shapeBuffer.length}`
    );
  }

  const groups = new Map<string, TopologyGroup>();

  for (let i = 0; i < instanceCount; i++) {
    const shapeRef = readShape2D(shapeBuffer, i);

    // Group key: topologyId + controlPointsSlot
    // Instances with same topology AND same control points buffer can batch
    const key = `${shapeRef.topologyId}:${shapeRef.pointsFieldSlot}`;

    if (!groups.has(key)) {
      groups.set(key, {
        topologyId: shapeRef.topologyId,
        controlPointsSlot: shapeRef.pointsFieldSlot,
        pointsCount: shapeRef.pointsCount,
        flags: shapeRef.flags,
        instanceIndices: [],
      });
    }

    groups.get(key)!.instanceIndices.push(i);
  }

  return groups;
}


/**
 * Check if indices form a contiguous run
 *
 * O(1) check: compare first and last index with expected span.
 * Assumes indices are sorted (grouping algorithm appends in order).
 *
 * @param indices - Sorted array of instance indices
 * @returns True if indices are contiguous [start, start+1, ..., start+N-1]
 */
export function isContiguous(indices: number[]): boolean {
  if (indices.length <= 1) return true;
  return indices[indices.length - 1] - indices[0] === indices.length - 1;
}


/**
 * Slice RGBA color buffer for a topology group.
 * Uses zero-copy subarray when indices are contiguous; copies to arena otherwise.
 */
export function sliceColorBuffer(
  fullColor: Uint8ClampedArray,
  instanceIndices: number[],
  arena: RenderBufferArena
): Uint8ClampedArray {
  const N = instanceIndices.length;

  if (isContiguous(instanceIndices)) {
    const start = instanceIndices[0];
    return fullColor.subarray(start * 4, (start + N) * 4);
  }

  const color = arena.allocRGBA(N);
  for (let i = 0; i < N; i++) {
    const srcIdx = instanceIndices[i];
    const s = srcIdx * 4;
    const o = i * 4;
    color[o] = fullColor[s];
    color[o + 1] = fullColor[s + 1];
    color[o + 2] = fullColor[s + 2];
    color[o + 3] = fullColor[s + 3];
  }
  return color;
}

/**
 * Convert color buffer from Float32Array to Uint8ClampedArray.
 *
 * SINGLE ENFORCER: HSL→RGB conversion happens here at the render boundary.
 * Color blocks output HSL values; the renderer expects RGB. This is the
 * one place where conversion occurs — no conversion inside blocks.
 *
 * Format: Input is [h,s,l,a] stride-4 Float32Array in [0,1] range.
 * Output: Uint8ClampedArray [r,g,b,a] in [0,255] range.
 *
 * @param input - Float32Array with HSLA values (stride 4)
 * @param count - Number of color entries
 * @param arena - Buffer arena for allocation
 * @returns Uint8ClampedArray with RGBA values
 */
function convertColorBufferToRgba(
  input: Float32Array,
  count: number,
  arena: RenderBufferArena
): Uint8ClampedArray {
  const output = arena.allocRGBA(count);

  for (let i = 0; i < count; i++) {
    const h = input[i * 4];
    const s = input[i * 4 + 1];
    const l = input[i * 4 + 2];
    const a = input[i * 4 + 3];

    // HSL→RGB conversion (single enforcer for color space conversion)
    const [r, g, b] = hslToRgbScalar(h, s, l);

    // Convert [0,1] → [0,255]
    output[i * 4] = r * 255;
    output[i * 4 + 1] = g * 255;
    output[i * 4 + 2] = b * 255;
    output[i * 4 + 3] = a * 255;
  }

  return output;
}

/**
 * Record assembler timing metrics to HealthMetrics ring buffers
 */
function recordAssemblerTiming(
  state: RuntimeState,
  timing: { groupingMs: number; slicingMs: number; totalMs: number }
): void {
  const h = state.health;

  h.assemblerGroupingMs[h.assemblerGroupingMsIndex] = timing.groupingMs;
  h.assemblerGroupingMsIndex = (h.assemblerGroupingMsIndex + 1) % h.assemblerGroupingMs.length;

  h.assemblerSlicingMs[h.assemblerSlicingMsIndex] = timing.slicingMs;
  h.assemblerSlicingMsIndex = (h.assemblerSlicingMsIndex + 1) % h.assemblerSlicingMs.length;

  h.assemblerTotalMs[h.assemblerTotalMsIndex] = timing.totalMs;
  h.assemblerTotalMsIndex = (h.assemblerTotalMsIndex + 1) % h.assemblerTotalMs.length;

  // Sync cache counters from module-level counters
  h.topologyGroupCacheHits = topologyGroupCacheHits;
  h.topologyGroupCacheMisses = topologyGroupCacheMisses;
}

/**
 * Assemble DrawOp operations for per-instance shapes
 *
 * Handles the `{ k: 'slot' }` shape case by grouping instances by topology
 * and emitting one DrawPathInstancesOp or DrawPrimitiveInstancesOp per group.
 *
 * @param step - Render step with per-instance shapes
 * @param shapeBuffer - Shape2D buffer (Uint32Array)
 * @param fullPosition - Full position buffer
 * @param fullColor - Full color buffer
 * @param scale - Uniform scale
 * @param count - Instance count
 * @param context - Assembly context (includes camera, arena)
 * @returns Array of DrawOp operations (path or primitive)
 */
function assemblePerInstanceShapes(
  step: StepRender,
  shapeBuffer: Uint32Array,
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  scale: number,
  count: number,
  context: AssemblerContext
): DrawOp[] {
  const { state, arena } = context;
  const t0 = performance.now();

  // Group instances by topology
  const groups = groupInstancesByTopology(shapeBuffer, count);

  const tGrouped = performance.now();

  const ops: DrawOp[] = [];

  // C-13: Read rotation and scale2 from slots if present
  const fullRotation = step.rotationSlot
    ? (state.values.objects.get(step.rotationSlot) as Float32Array | undefined)
    : undefined;

  const fullScale2 = step.scale2Slot
    ? (state.values.objects.get(step.scale2Slot) as Float32Array | undefined)
    : undefined;

  // Run projection using resolved camera params
  const resolved = context.resolvedCamera;
  if (fullPosition.length !== count * 3) {
    throw new Error(
      `RenderAssembler: Position buffer must be world-space vec3 (stride 3). ` +
      `Expected length ${count * 3}, got ${fullPosition.length}. ` +
      `Fix upstream: insert/compile an explicit pos2→pos3 adapter; RenderAssembler will not promote stride-2.`
    );
  }

  const projection = projectInstances(fullPosition, scale, count, resolved, arena);

  for (const [key, group] of groups) {
    // Skip empty groups
    if (group.instanceIndices.length === 0) {
      continue;
    }

    // Validate topology exists (group-level validation, not per-instance)
    const topology = getTopology(group.topologyId);

    // Slice RGBA color for this group (position is not needed post-projection)
    const color = sliceColorBuffer(fullColor, group.instanceIndices, arena);

    // C-13: Slice rotation and scale2 if present
    const rotation = fullRotation
      ? sliceRotationBuffer(fullRotation, group.instanceIndices, arena)
      : undefined;

    const scale2 = fullScale2
      ? sliceScale2Buffer(fullScale2, group.instanceIndices, arena)
      : undefined;

    // Slice projection outputs for this group (use arena)
    const groupN = group.instanceIndices.length;
    const groupScreenPos = arena.allocVec2(groupN);
    const groupScreenRadius = arena.allocF32(groupN);
    const groupDepth = arena.allocF32(groupN);
    const groupVisible = arena.allocU8(groupN);

    for (let i = 0; i < groupN; i++) {
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

    // Compact and copy in one step (projection already done)
    const compactedCopy = compactAndCopy(
      groupProjection,
      groupN,
      color,
      arena,
      rotation,
      scale2
    );

    const instanceTransforms: InstanceTransforms = {
      count: compactedCopy.count,
      position: compactedCopy.screenPosition,
      size: compactedCopy.screenRadius,
      rotation: compactedCopy.rotation,
      scale2: compactedCopy.scale2,
      depth: compactedCopy.depth,
    };
    const compactedColor = compactedCopy.color as Uint8ClampedArray;

    // Build style (shared by both path and primitive)
    const style = buildPathStyle(compactedColor, 'nonzero');

    if (isPathTopology(topology)) {
      // PATH TOPOLOGY: Build DrawPathInstancesOp
      const controlPointsBuffer = state.values.objects.get(
        group.controlPointsSlot as ValueSlot
      ) as Float32Array;

      if (!controlPointsBuffer || !(controlPointsBuffer instanceof Float32Array)) {
        throw new Error(
          `RenderAssembler: Control points buffer not found for topology ${group.topologyId} ` +
          `(slot ${group.controlPointsSlot}, instances: ${group.instanceIndices.join(', ')})`
        );
      }

      const geometry: PathGeometry = {
        topologyId: group.topologyId,
        verbs: getCachedVerbs(topology),
        points: controlPointsBuffer,
        pointsCount: group.pointsCount,
        flags: group.flags,
      };

      ops.push({
        kind: 'drawPathInstances',
        geometry,
        instances: instanceTransforms,
        style,
      });
    } else {
      // PRIMITIVE TOPOLOGY: Build DrawPrimitiveInstancesOp
      // Resolve params from topology defaults (per-instance params not yet supported)
      const params: Record<string, number> = {};
      topology.params.forEach((paramDef) => {
        params[paramDef.name] = paramDef.default;
      });

      const geometry: PrimitiveGeometry = {
        topologyId: group.topologyId,
        params,
      };

      ops.push({
        kind: 'drawPrimitiveInstances',
        geometry,
        instances: instanceTransforms,
        style,
      });
    }
  }

  const tSliced = performance.now();

  // Record timing to health metrics
  recordAssemblerTiming(state, {
    groupingMs: tGrouped - t0,
    slicingMs: tSliced - tGrouped,
    totalMs: tSliced - t0,
  });

  return ops;
}

/**
 * Slice rotation buffer for a topology group
 *
 * C-13: Helper to extract per-instance rotations for a subset of instances.
 * Uses zero-copy subarray when contiguous; copies to arena otherwise.
 *
 * @param fullRotation - Full rotation buffer (Float32Array, one value per instance)
 * @param instanceIndices - Indices of instances to extract
 * @param arena - Pre-allocated buffer arena
 * @returns Sliced rotation buffer
 */
function sliceRotationBuffer(
  fullRotation: Float32Array,
  instanceIndices: number[],
  arena: RenderBufferArena
): Float32Array {
  const N = instanceIndices.length;

  if (isContiguous(instanceIndices)) {
    // Zero-copy view
    const start = instanceIndices[0];
    return fullRotation.subarray(start, start + N);
  }

  // Non-contiguous: copy to arena
  const rotation = arena.allocF32(N);
  for (let i = 0; i < N; i++) {
    rotation[i] = fullRotation[instanceIndices[i]];
  }
  return rotation;
}

/**
 * Slice scale2 buffer for a topology group
 *
 * C-13: Helper to extract per-instance anisotropic scales for a subset of instances.
 * Uses zero-copy subarray when contiguous; copies to arena otherwise.
 *
 * @param fullScale2 - Full scale2 buffer (Float32Array, x,y pairs per instance)
 * @param instanceIndices - Indices of instances to extract
 * @param arena - Pre-allocated buffer arena
 * @returns Sliced scale2 buffer
 */
function sliceScale2Buffer(
  fullScale2: Float32Array,
  instanceIndices: number[],
  arena: RenderBufferArena
): Float32Array {
  const N = instanceIndices.length;

  if (isContiguous(instanceIndices)) {
    // Zero-copy view
    const start = instanceIndices[0];
    return fullScale2.subarray(start * 2, (start + N) * 2);
  }

  // Non-contiguous: copy to arena
  const scale2 = arena.allocVec2(N);
  for (let i = 0; i < N; i++) {
    const srcIdx = instanceIndices[i];
    scale2[i * 2] = fullScale2[srcIdx * 2];
    scale2[i * 2 + 1] = fullScale2[srcIdx * 2 + 1];
  }
  return scale2;
}

/**
 * Build PathGeometry from resolved shape
 *
 * Extracts local-space control points and path metadata into PathGeometry structure.
 * Control points are assumed to be in local space (centered at origin).
 *
 * @param resolvedShape - Resolved shape with topology and control points
 * @param controlPoints - Control points buffer in local space
 * @returns PathGeometry structure for v2 rendering
 */
function buildPathGeometry(
  resolvedShape: ResolvedShape,
  controlPoints: Float32Array
): PathGeometry {
  if (resolvedShape.mode !== 'path') {
    throw new Error(
      `buildPathGeometry: Expected path topology, got ${resolvedShape.mode}`
    );
  }

  if (!resolvedShape.verbs) {
    throw new Error('buildPathGeometry: Path topology missing verbs');
  }

  return {
    topologyId: resolvedShape.topologyId,
    verbs: resolvedShape.verbs,
    points: controlPoints,
    pointsCount: controlPoints.length / 2,
    flags: resolvedShape.params.closed ? 1 : 0,
  };
}

/**
 * Build PrimitiveGeometry from resolved shape
 *
 * Extracts topology ID and parameter values into PrimitiveGeometry structure.
 *
 * @param resolvedShape - Resolved shape with topology and params
 * @returns PrimitiveGeometry structure for v2 rendering
 */
function buildPrimitiveGeometry(
  resolvedShape: ResolvedShape
): PrimitiveGeometry {
  if (resolvedShape.mode !== 'primitive') {
    throw new Error(
      `buildPrimitiveGeometry: Expected primitive topology, got ${resolvedShape.mode}`
    );
  }

  return {
    topologyId: resolvedShape.topologyId,
    params: resolvedShape.params,
  };
}

/**
 * Build InstanceTransforms from render step data
 *
 * Constructs world-space instance transform data.
 * Position is in normalized [0,1] space.
 * Size is isotropic scale (combined with optional scale2 for anisotropic).
 *
 * @param count - Number of instances
 * @param position - Position buffer (x,y OR x,y,z interleaved, normalized [0,1])
 * @param size - Uniform size or per-instance sizes (isotropic scale)
 * @param rotation - Optional per-instance rotations (radians)
 * @param scale2 - Optional per-instance anisotropic scale (x,y interleaved)
 * @param depth - Optional per-instance depth (when projected)
 * @returns InstanceTransforms structure for v2 rendering
 */
function buildInstanceTransforms(
  count: number,
  position: Float32Array,
  size: number | Float32Array,
  rotation?: Float32Array,
  scale2?: Float32Array,
  depth?: Float32Array
): InstanceTransforms {
  return {
    count,
    position,
    size,
    rotation,
    scale2,
    depth,
  };
}

/**
 * Build PathStyle from color buffer
 *
 * Extracts explicit style information from color buffer.
 * Future work will add stroke, opacity, blend modes, etc.
 *
 * @param color - Color buffer (RGBA per instance or uniform)
 * @param fillRule - Fill rule ('nonzero' or 'evenodd')
 * @returns PathStyle structure for v2 rendering
 */
function buildPathStyle(
  color: Uint8ClampedArray,
  fillRule?: 'nonzero' | 'evenodd'
): PathStyle {
  return {
    fillColor: color,
    fillRule,
  };
}

/**
 * Assemble DrawOp operations from a render step
 *
 * This is the v2 assembly path that produces explicit geometry/instances/style
 * structures. Unlike v1, this separates concerns and uses local-space geometry.
 *
 * NOW SUPPORTS PER-INSTANCE SHAPES: When shape is a buffer (`{ k: 'slot' }`),
 * instances are grouped by topology and multiple ops are emitted.
 *
 * SUPPORTS PRIMITIVES: Emits DrawPrimitiveInstancesOp for ellipse, rect, etc.
 * SUPPORTS PROJECTION: When camera is present, applies 3D projection and depth-sorting.
 *
 * @param step - The render step to assemble
 * @param context - Assembly context with signals, instances, state, and arena
 * @returns Array of DrawOp operations (one or more, path or primitive)
 */
export function assembleDrawPathInstancesOp(
  step: StepRender,
  context: AssemblerContext
): DrawOp[] {
  const { sigToSlot, instances, state, arena } = context;

  // Get instance declaration
  const instance = instances.get(step.instanceId);
  if (!instance) {
    throw new Error(
      `RenderAssembler: Instance ${step.instanceId} not found in state.instances. ` +
      `This indicates a compilation error where StepRender references an undeclared instance.`
    );
  }

  // Resolve count from instance
  const count = typeof instance.count === 'number' ? instance.count : 0;
  if (count === 0) {
    return []; // Empty instance, skip
  }

  // Read position buffer from slot
  const positionBuffer = state.values.objects.get(step.positionSlot) as ArrayBufferView;
  if (!positionBuffer) {
    throw new Error(`RenderAssembler: Position buffer not found in slot ${step.positionSlot}`);
  }

  // Position must be Float32Array for v2
  if (!(positionBuffer instanceof Float32Array)) {
    throw new Error(
      `RenderAssembler: Position buffer must be Float32Array, got ${positionBuffer.constructor.name}`
    );
  }

  // Read color buffer from slot
  const rawColorBuffer = state.values.objects.get(step.colorSlot) as ArrayBufferView;
  if (!rawColorBuffer) {
    throw new Error(`RenderAssembler: Color buffer not found in slot ${step.colorSlot}`);
  }

  // Convert color buffer to Uint8ClampedArray [0,255] RGBA
  // HSL→RGB conversion happens here at render boundary (single enforcer)
  let colorBuffer: Uint8ClampedArray;
  if (rawColorBuffer instanceof Uint8ClampedArray) {
    colorBuffer = rawColorBuffer;
  } else if (rawColorBuffer instanceof Float32Array) {
    colorBuffer = convertColorBufferToRgba(rawColorBuffer, count, arena);
  } else {
    throw new Error(
      `RenderAssembler: Color buffer must be Float32Array or Uint8ClampedArray, got ${rawColorBuffer.constructor.name}`
    );
  }

  // Resolve scale (uniform signal)
  const scale = resolveScale(step.scale, sigToSlot, state);

  // Resolve shape
  const shape = resolveShape(step.shape, sigToSlot, state);

  // Check if per-instance shapes (shape buffer)
  if (shape instanceof Uint32Array) {
    // Per-instance shapes: group by topology and emit multiple ops
    return assemblePerInstanceShapes(
      step,
      shape,
      positionBuffer,
      colorBuffer,
      scale,
      count,
      context  // Pass full context (includes camera and arena)
    );
  }

  // Uniform shape: resolve fully and emit single op
  const controlPointsBuffer = resolveControlPoints(step.controlPoints, state);
  const resolvedShape = resolveShapeFully(shape, controlPointsBuffer);

  // C-13: Read rotation and scale2 from slots if present
  const rotation = step.rotationSlot
    ? (state.values.objects.get(step.rotationSlot) as Float32Array | undefined)
    : undefined;

  const scale2 = step.scale2Slot
    ? (state.values.objects.get(step.scale2Slot) as Float32Array | undefined)
    : undefined;

  // Run projection using resolved camera params
  {
    // Run projection using resolved camera params
    if (positionBuffer.length !== count * 3) {
      throw new Error(
        `RenderAssembler: Position buffer must be world-space vec3 (stride 3). ` +
        `Expected length ${count * 3}, got ${positionBuffer.length}. ` +
        `Fix upstream: insert/compile an explicit pos2→pos3 adapter; RenderAssembler will not promote stride-2.`
      );
    }

    // Project, compact, and copy in one step (uses arena from context)
    const compactedCopy = projectAndCompact(
      positionBuffer,
      scale,
      count,
      colorBuffer,
      context.resolvedCamera,
      arena,
      rotation,
      scale2
    );

    // Build instance transforms with copied data
    const instanceTransforms = buildInstanceTransforms(
      compactedCopy.count,
      compactedCopy.screenPosition,
      compactedCopy.screenRadius,
      compactedCopy.rotation,
      compactedCopy.scale2,
      compactedCopy.depth
    );

    // Build style
    const style = buildPathStyle(compactedCopy.color, 'nonzero');

    // Dispatch based on topology mode
    if (resolvedShape.mode === 'path') {
      // PATH TOPOLOGY: Build DrawPathInstancesOp
      if (!controlPointsBuffer || !(controlPointsBuffer instanceof Float32Array)) {
        throw new Error(
          'RenderAssembler: Path topology requires control points buffer (Float32Array)'
        );
      }

      const geometry = buildPathGeometry(resolvedShape, controlPointsBuffer);

      return [{
        kind: 'drawPathInstances',
        geometry,
        instances: instanceTransforms,
        style,
      }];
    } else {
      // PRIMITIVE TOPOLOGY: Build DrawPrimitiveInstancesOp
      const geometry = buildPrimitiveGeometry(resolvedShape);

      return [{
        kind: 'drawPrimitiveInstances',
        geometry,
        instances: instanceTransforms,
        style,
      }];
    }
  }
}

/**
 * Assemble all render steps into a v2 RenderFrameIR
 *
 * This produces the target v2 frame structure with explicit draw operations.
 * Unlike v1, this uses local-space geometry with world-space instance transforms.
 *
 * NOW SUPPORTS PER-INSTANCE SHAPES: Multiple ops can be emitted per render step.
 * SUPPORTS PRIMITIVES: Handles both DrawPathInstancesOp and DrawPrimitiveInstancesOp.
 * SUPPORTS PROJECTION: Always applies projection from resolved camera params.
 * ZERO ALLOCATIONS: All buffers come from the pre-allocated arena in context.
 *
 * @param renderSteps - Array of render steps to assemble
 * @param context - Assembly context (must include initialized arena)
 * @returns RenderFrameIR with DrawOp operations
 */
export function assembleRenderFrame(
  renderSteps: readonly StepRender[],
  context: AssemblerContext
): RenderFrameIR {
  const ops: DrawOp[] = [];

  for (const step of renderSteps) {
    const stepOps = assembleDrawPathInstancesOp(step, context);
    // Avoid spread allocation — push individually
    for (let i = 0; i < stepOps.length; i++) {
      ops.push(stepOps[i]);
    }
  }

  return {
    version: 2,
    ops,
  };
}
