/**
 * LegacyRenderAssembler - Transitional CPU Projection Assembly
 *
 * Assembles RenderFrameIR from schedule execution results.
 * This module is the single point where IR references become concrete render data.
 * [LAW:one-way-deps] Canonical runtime hotpath ownership is GPU sink-table driven;
 * this module is isolated for non-canonical stepping/test execution only.
 *
 * ARCHITECTURAL PURPOSE (from 8-before-render.md):
 * 1. Resolve field references via Materializer for every field the pass needs
 * 2. Resolve scalar references by reading scalar slot banks directly
 * 3. Resolve shape handles → (topologyId, pointsBuffer, header metadata)
 * 4. Emit render passes that are already normalized
 *
 * This is where we enforce the invariant "Renderer is sink-only."
 *
 * Assembles RenderFrameIR using path-only DrawOp operations (v2 format).
 * Produces DrawPathInstancesOp.
 */

import type { StepRender, InstanceDecl } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import type { CompiledProgramIR, RuntimeScalarArenaAddress } from '../compiler/ir/program';
import type { PathTopologyDef, TopologyDef, TopologyId } from '../shapes/types';
import { getProgramTopology } from '../compiler/ir/program-topology';
import type {
  DrawOp,
  PathGeometry,
  InstanceTransforms,
  PathStyle,
  RenderFrameIR,
} from '../render/types';
import {
  SHAPE_BANK_HEADER_WORDS,
  SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  readShapeBankHandleMetadata,
  readShapeBankHeader,
} from './RuntimeState';
import type { ValueSlot } from '../types';
import {
  projectFieldOrtho,
  projectFieldRadiusOrtho,
  ORTHO_CAMERA_DEFAULTS,
} from '../projection/ortho-kernel';
import { hslToRgbScalar } from './color-math';
import type { PureFnExecutionContext } from './ScalarKernelLibrary';
import { resolveInstanceLaneCount } from './InstanceCountResolver';
import {
  projectFieldPerspective,
  projectFieldRadiusPerspective,
  deriveCamPos,
  type PerspectiveCameraParams,
} from '../projection/perspective-kernel';
import type { ResolvedCameraParams } from './CameraResolver';
import { arenaDecodeToAoS, arenaIndex, type ArenaSlotDescriptor } from './ArenaValueStore';
import { EMPTY_RENDER_FRAME } from '../render/types';
import {
  CANONICAL_CAMERA_UP,
  CANONICAL_CAMERA_WORLD_TARGET_Z,
} from '../core/coordinate-system';

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
const _arenaSliceCache = new WeakMap<Float32Array, Map<number, Map<number, Float32Array>>>();

function getCachedVerbs(topology: PathTopologyDef): Uint8Array {
  let cached = _topologyVerbsCache.get(topology.id);
  if (!cached) {
    // eslint-disable-next-line oscilla/no-hot-path-alloc -- [LAW:verifiable-goals] One-time cache fill per static topology id.
    cached = new Uint8Array(topology.verbs);
    _topologyVerbsCache.set(topology.id, cached);
  }
  return cached;
}

function getCachedArenaSlice(
  arena: Float32Array,
  start: number,
  end: number,
): Float32Array {
  let slicesByStart = _arenaSliceCache.get(arena);
  if (!slicesByStart) {
    slicesByStart = new Map<number, Map<number, Float32Array>>();
    _arenaSliceCache.set(arena, slicesByStart);
  }
  let slicesByEnd = slicesByStart.get(start);
  if (!slicesByEnd) {
    slicesByEnd = new Map<number, Float32Array>();
    slicesByStart.set(start, slicesByEnd);
  }
  const cached = slicesByEnd.get(end);
  if (cached) {
    return cached;
  }
  const created = arena.subarray(start, end);
  // [LAW:verifiable-goals] Cache key path avoids per-call string construction so
  // direct numeric slot reads can remain allocation-free on repeated frames.
  slicesByEnd.set(end, created);
  return created;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Fully resolved shape data for rendering
 * @internal Used by shape resolution helpers
 */
interface ResolvedShape {
  resolved: true;
  topologyId: TopologyId;
  mode: 'path';
  params: Record<string, number>;
  verbs: Uint8Array;
  controlPoints: ArrayBufferView;
}

interface MutablePerspectiveCameraParams {
  camPosX: number;
  camPosY: number;
  camPosZ: number;
  camTargetX: number;
  camTargetY: number;
  camTargetZ: number;
  camUpX: number;
  camUpY: number;
  camUpZ: number;
  fovY: number;
  near: number;
  far: number;
}

// [LAW:no-shared-mutable-globals] Single-owner module scratch reused only by
// RenderAssembler for per-frame temporary camera params.
const _perspectiveParamsScratch: MutablePerspectiveCameraParams = {
  camPosX: 0,
  camPosY: 0,
  camPosZ: 0,
  camTargetX: 0,
  camTargetY: 0,
  camTargetZ: CANONICAL_CAMERA_WORLD_TARGET_Z,
  camUpX: CANONICAL_CAMERA_UP.x,
  camUpY: CANONICAL_CAMERA_UP.y,
  camUpZ: CANONICAL_CAMERA_UP.z,
  fovY: 0,
  near: 0,
  far: 1,
};

// [LAW:no-shared-mutable-globals] Single-owner module scratch reused only by
// RenderAssembler; buffers are replaced each call before use.
const _projectionOutputScratch: ProjectionOutput = {
  screenPosition: new Float32Array(0),
  screenRadius: new Float32Array(0),
  depth: new Float32Array(0),
  visible: new Uint8Array(0),
};

// =============================================================================
// Projection Types
// =============================================================================

/**
 * Projection output for a set of instances.
 * Separate buffers — world-space inputs are never mutated.
 */
interface ProjectionOutput {
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
function depthSortAndCompactBuffers(
  screenPosition: Float32Array,
  screenRadius: Float32Array,
  depth: Float32Array,
  visible: Uint8Array,
  count: number,
  color: Uint8ClampedArray,
  arena: RenderBufferArena,
  rotation?: Float32Array,
  scale2?: Float32Array,
  isotropicScale?: Float32Array,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation: Float32Array;
  scale2: Float32Array;
} {
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
    // [LAW:dataflow-not-control-flow] Radius compaction always executes; optional scale is data.
    outRadius[out] = isotropicScale ? screenRadius[src] * isotropicScale[src] : screenRadius[src];
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

  // [LAW:dataflow-not-control-flow] Always produce rotation and scale2 buffers.
  // When source buffers are absent, fill with identity values (rotation=0, scale2=[1,1]).
  // Arena buffers contain stale data from previous frames, so identity fill is required.
  const compactedRotation = arena.allocF32(visibleCount);
  if (rotation) {
    for (let out = 0; out < visibleCount; out++) {
      compactedRotation[out] = rotation[indices[out]];
    }
  } else {
    compactedRotation.fill(0);
  }

  const compactedScale2 = arena.allocVec2(visibleCount);
  if (scale2) {
    for (let out = 0; out < visibleCount; out++) {
      const src = indices[out];
      compactedScale2[out * 2] = scale2[src * 2];
      compactedScale2[out * 2 + 1] = scale2[src * 2 + 1];
    }
  } else {
    // Fill with identity scale [1,1] pairs
    for (let i = 0; i < visibleCount; i++) {
      compactedScale2[i * 2] = 1;
      compactedScale2[i * 2 + 1] = 1;
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

function depthSortAndCompact(
  projection: ProjectionOutput,
  count: number,
  color: Uint8ClampedArray,
  arena: RenderBufferArena,
  rotation?: Float32Array,
  scale2?: Float32Array,
  isotropicScale?: Float32Array,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation: Float32Array;
  scale2: Float32Array;
} {
  return depthSortAndCompactBuffers(
    projection.screenPosition,
    projection.screenRadius,
    projection.depth,
    projection.visible,
    count,
    color,
    arena,
    rotation,
    scale2,
    isotropicScale,
  );
}

/**
 * Normalize RenderInstances2D control points into world-space vec3 positions.
 * Accepts either vec2 (x,y) or vec3 (x,y,z) interleaved buffers.
 */
function ensureWorldPositionVec3(
  positions: Float32Array,
  count: number,
  arena: RenderBufferArena,
): Float32Array {
  const vec3Len = count * 3;
  if (positions.length === vec3Len) return positions;

  const vec2Len = count * 2;
  if (positions.length !== vec2Len) {
    throw new Error(
      'RenderAssembler: Position/controlPoints buffer must be vec2 or vec3 interleaved. ' +
      'Expected length ' + vec2Len + ' or ' + vec3Len + ', got ' + positions.length + '.'
    );
  }

  // [LAW:one-source-of-truth] RenderInstances2D reads canonical controlPoints and derives z=0 world positions.
  const promoted = arena.allocVec3(count);
  for (let i = 0; i < count; i++) {
    promoted[i * 3 + 0] = positions[i * 2 + 0];
    promoted[i * 3 + 1] = positions[i * 2 + 1];
    promoted[i * 3 + 2] = 0;
  }
  return promoted;
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
function projectInstances(
  worldPositions: Float32Array,
  worldRadius: number,
  count: number,
  resolved: ResolvedCameraParams,
  arena: RenderBufferArena,
  out: ProjectionOutput = _projectionOutputScratch,
): ProjectionOutput {
  // Allocate output buffers from arena (zero allocations after init)
  out.screenPosition = arena.allocVec2(count);
  out.screenRadius = arena.allocF32(count);
  out.depth = arena.allocF32(count);
  out.visible = arena.allocU8(count);

  // Uniform radii input for field radius projection
  const worldRadii = arena.allocF32(count);
  worldRadii.fill(worldRadius);

  if (resolved.projection === 'ortho') {
    projectFieldOrtho(worldPositions, count, ORTHO_CAMERA_DEFAULTS, out.screenPosition, out.depth, out.visible);
    projectFieldRadiusOrtho(worldRadii, worldPositions, count, ORTHO_CAMERA_DEFAULTS, out.screenRadius);
  } else {
    // Derive kernel params from ResolvedCameraParams
    const [camPosX, camPosY, camPosZ] = deriveCamPos(
      resolved.centerX, resolved.centerY, 0, // camera target = (centerX, centerY, 0) in world
      resolved.tiltRad, resolved.yawRad, resolved.distance
    );
    _perspectiveParamsScratch.camPosX = camPosX;
    _perspectiveParamsScratch.camPosY = camPosY;
    _perspectiveParamsScratch.camPosZ = camPosZ;
    _perspectiveParamsScratch.camTargetX = resolved.centerX;
    _perspectiveParamsScratch.camTargetY = resolved.centerY;
    _perspectiveParamsScratch.camTargetZ = CANONICAL_CAMERA_WORLD_TARGET_Z;
    _perspectiveParamsScratch.camUpX = CANONICAL_CAMERA_UP.x;
    _perspectiveParamsScratch.camUpY = CANONICAL_CAMERA_UP.y;
    _perspectiveParamsScratch.camUpZ = CANONICAL_CAMERA_UP.z;
    _perspectiveParamsScratch.fovY = resolved.fovYRad;
    _perspectiveParamsScratch.near = resolved.near;
    _perspectiveParamsScratch.far = resolved.far;
    const perspParams: PerspectiveCameraParams = _perspectiveParamsScratch;
    projectFieldPerspective(worldPositions, count, perspParams, out.screenPosition, out.depth, out.visible);
    projectFieldRadiusPerspective(worldRadii, worldPositions, count, perspParams, out.screenRadius);
  }

  return out;
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
function projectAndCompact(
  worldPositions: Float32Array,
  worldRadius: number,
  count: number,
  color: Uint8ClampedArray,
  camera: ResolvedCameraParams,
  arena: RenderBufferArena,
  rotation?: Float32Array,
  scale2?: Float32Array,
  isotropicScale?: Float32Array,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation: Float32Array;
  scale2: Float32Array;
} {
  // Step 1: Project
  const projection = projectInstances(worldPositions, worldRadius, count, camera, arena, _projectionOutputScratch);

  // Step 2: Compact & sort (returns arena views directly)
  return depthSortAndCompact(projection, count, color, arena, rotation, scale2, isotropicScale);
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
function compactAndCopy(
  projection: ProjectionOutput,
  count: number,
  color: Uint8ClampedArray,
  arena: RenderBufferArena,
  rotation?: Float32Array,
  scale2?: Float32Array,
  isotropicScale?: Float32Array,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation: Float32Array;
  scale2: Float32Array;
} {
  // Compact & sort (returns arena views directly)
  return depthSortAndCompact(projection, count, color, arena, rotation, scale2, isotropicScale);
}

/**
 * AssemblerContext - Context needed for render assembly
 */
export interface AssemblerContext {
  /** Compiled program that owns all topology definitions used during assembly. */
  program: CompiledProgramIR;
  /** Instance declarations */
  instances: ReadonlyMap<string, InstanceDecl>;
  /** Runtime state for reading one-cardinality expression slots and many buffers */
  state: RuntimeState;
  /** Resolved camera params from frame globals (always present, defaults if no Camera block) */
  resolvedCamera: ResolvedCameraParams;
  /** Pre-allocated buffer arena for zero-allocation rendering */
  arena: RenderBufferArena;
  /** One-cardinality ValueExprId -> canonical arena address metadata. */
  scalarExprToArenaAddress?: ReadonlyMap<number, RuntimeScalarArenaAddress>;
  /** Slot -> arena descriptor map (for numeric field reads). */
  slotToArena?: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>;
  /** Optional pure-function execution context for dynamic instance-count evaluation. */
  pureFnContext?: PureFnExecutionContext;
}

/**
 * Resolve scale from step specification
 *
 * Scale is either a uniform multiplier or a per-instance field.
 * MUST be provided - no fallback values in render pipeline.
 */
type ResolvedScale =
  | { kind: 'uniform'; value: number }
  | { kind: 'perInstance'; values: Float32Array };

function resolveScale(
  scaleSpec: StepRender['scale'],
  scalarExprToArenaAddress: ReadonlyMap<number, RuntimeScalarArenaAddress> | undefined,
  state: RuntimeState,
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor> | undefined,
): ResolvedScale {
  if (scaleSpec === undefined) {
    throw new Error(
      'RenderAssembler: scale is required. ' +
      'Ensure RenderInstances2D block has a scale input (default 1.0 from registry).'
    );
  }

  const scaleBuffer = resolveNumericSlotBuffer(scaleSpec.slot, state, slotToArena);
  if (!(scaleBuffer instanceof Float32Array)) {
    throw new Error(
      'RenderAssembler: scale slot must be Float32Array, got ' +
      (scaleBuffer ? scaleBuffer.constructor.name : 'undefined')
    );
  }
  return { kind: 'perInstance', values: scaleBuffer };
}

/**
 * Resolve shape from step specification
 *
 * Returns topology ID for one-cardinality handles and handle field buffers for
 * per-instance topology routing.
 *
 * MUST be provided - no fallback values in render pipeline.
 * [LAW:one-source-of-truth] Legacy inline topology/param shape descriptors are
 * removed; render shape authority is handle-based only.
 */
function resolveShape(
  shapeSpec: StepRender['shape'],
  state: RuntimeState,
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor> | undefined,
): Float32Array | TopologyId {
  if (shapeSpec === undefined) {
    throw new Error(
      'RenderAssembler: shape is required. ' +
      'Ensure a shape block (Ellipse, Rect, etc.) is wired to the render pipeline.'
    );
  }

  // [LAW:one-source-of-truth] Per-instance shapes are canonical numeric
  // handle fields in arena-backed slots.
  const numericShapeBuffer = resolveNumericSlotBuffer(shapeSpec.slot, state, slotToArena);
  if (numericShapeBuffer instanceof Float32Array) {
    return numericShapeBuffer;
  }
  throw new Error(
    'RenderAssembler: shape slot ' +
      shapeSpec.slot +
      ' must materialize to Float32Array handle field, got ' +
      (numericShapeBuffer ? numericShapeBuffer.constructor.name : 'undefined'),
  );
}

/**
 * Resolve control points from step specification
 */
function resolveControlPoints(
  cpSpec: StepRender['controlPoints'],
  state: RuntimeState,
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor> | undefined,
  arena: RenderBufferArena,
): ArrayBufferView | undefined {
  if (!cpSpec) {
    return undefined;
  }
  return resolveNumericSlotBuffer(cpSpec.slot, state, slotToArena, arena);
}

function allocatePackedAosBuffer(arena: RenderBufferArena, laneCount: number, stride: number): Float32Array {
  switch (stride) {
    case 1:
      return arena.allocF32(laneCount);
    case 2:
      return arena.allocVec2(laneCount);
    case 3:
      return arena.allocVec3(laneCount);
    default:
      return arena.allocF32(laneCount * stride);
  }
}

function resolveNumericSlotBuffer(
  slot: ValueSlot,
  state: RuntimeState,
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor> | undefined,
  arena?: RenderBufferArena,
  expectedLaneCount?: number,
): ArrayBufferView {
  const arenaDesc = slotToArena?.get(slot);
  if (arenaDesc) {
    if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
      throw new Error(
        'RenderAssembler: arena too small for numeric slot ' +
          slot +
          ' (need ' +
          (arenaDesc.offset + arenaDesc.length) +
          ', have ' +
          state.arena.length +
          ')',
      );
    }
    const laneCount = expectedLaneCount ?? arenaDesc.laneCount;
    if (laneCount > arenaDesc.laneCount) {
      throw new Error(
        'RenderAssembler: requested laneCount ' +
          laneCount +
          ' exceeds descriptor laneCount ' +
          arenaDesc.laneCount +
          ' for slot ' +
          slot,
      );
    }

    const packing = arenaDesc.packing ?? 'soa';
    const laneStride = arenaDesc.laneStride ?? (packing === 'soa' ? 1 : arenaDesc.stride);
    const componentStride = arenaDesc.componentStride ?? (packing === 'soa' ? arenaDesc.laneCount : 1);
    const isDirectAosLayout =
      laneCount === arenaDesc.laneCount &&
      !arenaDesc.componentOffsets &&
      packing === 'aos' &&
      laneStride === arenaDesc.stride &&
      componentStride === 1;
    const isDirectScalarLayout =
      laneCount === arenaDesc.laneCount &&
      !arenaDesc.componentOffsets &&
      arenaDesc.stride === 1 &&
      laneStride === 1;
    if (isDirectAosLayout || isDirectScalarLayout) {
      return getCachedArenaSlice(
        state.arena,
        arenaDesc.offset,
        arenaDesc.offset + arenaDesc.length,
      );
    }

    const requiredLength = laneCount * arenaDesc.stride;
    const decodeDesc: ArenaSlotDescriptor =
      requiredLength === arenaDesc.length
        ? arenaDesc
        : { ...arenaDesc, laneCount, length: requiredLength };
    const outBuffer = arena
      ? allocatePackedAosBuffer(arena, laneCount, arenaDesc.stride)
      : undefined;
    return arenaDecodeToAoS(state.arena, decodeDesc, outBuffer);
  }

  throw new Error('RenderAssembler: missing arena descriptor for numeric slot ' + slot);
}

/**
 * Type guard for PathTopologyDef
 */
export function isPathTopology(topology: TopologyDef): topology is PathTopologyDef {
  return 'verbs' in topology;
}

/**
 * Fully resolve shape for renderer
 *
 * Resolves the canonical handle-derived topology ID to concrete path metadata.
 *
 * @param shape - Topology ID resolved from ShapeBank handle
 * @param controlPoints - Optional control points for path shapes
 * @returns ResolvedShape for renderer
 */
function resolveShapeFully(
  program: CompiledProgramIR,
  shape: TopologyId,
  controlPoints?: ArrayBufferView
): ResolvedShape {
  const topology = getProgramTopology(program, shape);
  if (!isPathTopology(topology)) {
    throw new Error(
      `RenderAssembler: topology ${shape} is not a path topology. ` +
      'Shapes must provide Field<vec2> control points and path topology.'
    );
  }

  if (!controlPoints) {
    throw new Error(
      `RenderAssembler: path topology ${shape} requires control points buffer`
    );
  }

  return {
    resolved: true,
    topologyId: shape,
    mode: 'path',
    params: {},
    verbs: getCachedVerbs(topology),
    controlPoints,
  };
}

/**
 * Type guard: Check if a step is a render step
 */
export function isRenderStep(step: { kind: string }): step is StepRender {
  return step.kind === 'render';
}

// ============================================================================
// V2 RENDER ASSEMBLY - DrawPathInstancesOp
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

function createTopologyGroup(
  topologyId: number,
  controlPointsSlot: number,
  pointsCount: number,
  flags: number,
): TopologyGroup {
  /* eslint-disable oscilla/no-hot-path-alloc -- [LAW:verifiable-goals] Group records are allocated on topology-group misses, not per-lane math. */
  return {
    topologyId,
    controlPointsSlot,
    pointsCount,
    flags,
    instanceIndices: [],
  };
  /* eslint-enable oscilla/no-hot-path-alloc */
}

function createInstanceTransforms(compactedCopy: {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  rotation: Float32Array;
  scale2: Float32Array;
  depth: Float32Array;
}): InstanceTransforms {
  return {
    count: compactedCopy.count,
    position: compactedCopy.screenPosition,
    size: compactedCopy.screenRadius,
    rotation: compactedCopy.rotation,
    scale2: compactedCopy.scale2,
    depth: compactedCopy.depth,
  };
}

function createPathGeometry(
  group: TopologyGroup,
  topology: PathTopologyDef,
  arenaControlPointsBuffer: Float32Array,
): PathGeometry {
  return {
    topologyId: group.topologyId,
    verbs: getCachedVerbs(topology),
    points: arenaControlPointsBuffer,
    pointsCount: group.pointsCount,
    flags: group.flags,
  };
}

function createDrawPathInstancesOp(
  geometry: PathGeometry,
  instances: InstanceTransforms,
  style: PathStyle,
): DrawOp {
  return {
    kind: 'drawPathInstances',
    geometry,
    instances,
    style,
  };
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
const topologyGroupCache = new WeakMap<Float32Array, { count: number; groups: Map<string, TopologyGroup> }>();

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
 * @param shapeBuffer - Handle buffer (Float32Array) containing numeric handle values
 * @param instanceCount - Number of instances
 * @returns Map of topology groups keyed by "topologyId:controlPointsSlot"
 */
export function groupInstancesByTopology(
  shapeBuffer: Float32Array,
  instanceCount: number,
  state: RuntimeState,
): Map<string, TopologyGroup> {
  const cached = topologyGroupCache.get(shapeBuffer);
  if (cached && cached.count === instanceCount) {
    topologyGroupCacheHits++;
    return cached.groups;
  }

  topologyGroupCacheMisses++;
  const groups = computeTopologyGroups(shapeBuffer, instanceCount, state);
  topologyGroupCache.set(shapeBuffer, { count: instanceCount, groups });
  return groups;
}

/**
 * Compute topology groups (inner logic, uncached)
 *
 * Single-pass O(N) grouping algorithm. Instances with the same topology
 * and control points buffer are grouped together for batched rendering.
 *
 * @param shapeBuffer - Handle buffer (Float32Array) containing numeric handle values
 * @param instanceCount - Number of instances
 * @returns Map of topology groups keyed by "topologyId:controlPointsSlot"
 */
export function computeTopologyGroups(
  shapeBuffer: Float32Array,
  instanceCount: number,
  state: RuntimeState,
): Map<string, TopologyGroup> {
  return computeTopologyGroupsFromHandles(shapeBuffer, instanceCount, state);
}

function computeTopologyGroupsFromHandles(
  shapeBuffer: Float32Array,
  instanceCount: number,
  state: RuntimeState,
): Map<string, TopologyGroup> {
  if (shapeBuffer.length < instanceCount) {
    throw new Error(
      'RenderAssembler: Shape handle buffer length mismatch. ' +
      'Expected >=' +
      instanceCount +
      ', got ' +
      shapeBuffer.length,
    );
  }
  const shapeBank = state.shapeBank;
  if (!shapeBank) {
    throw new Error('RenderAssembler: shapeBank is required for per-instance shape handles');
  }
  const groups = new Map<string, TopologyGroup>();
  for (let i = 0; i < instanceCount; i++) {
    const rawHandle = shapeBuffer[i];
    if (!Number.isFinite(rawHandle)) {
      throw new Error('RenderAssembler: shape handle is not finite at instance ' + i);
    }
    if (!Number.isInteger(rawHandle)) {
      throw new Error(
        'RenderAssembler: shape handle must be an integer at instance ' +
          i +
          ' (got ' +
          rawHandle +
          ')',
      );
    }
    const handle = Math.trunc(rawHandle);
    if (handle < 0 || handle + SHAPE_BANK_HEADER_WORDS > shapeBank.data.length) {
      throw new Error('RenderAssembler: shape handle out of range at instance ' + i + ': ' + handle);
    }
    const metadata = readShapeBankHandleMetadata(shapeBank, handle);
    const header = readShapeBankHeader(shapeBank.data, handle);
    if (metadata.controlPointSlot === SHAPE_BANK_NO_CONTROL_POINT_SLOT) {
      // [LAW:single-enforcer] Render assembly is the single runtime boundary
      // that validates per-instance shape-handle geometry metadata.
      throw new Error(
        'RenderAssembler: shape handle missing control-point slot metadata at instance ' +
          i +
          ' (handle ' +
          handle +
          ')',
      );
    }
    const controlPointsSlot = metadata.controlPointSlot;
    const key = metadata.topologyId + ':' + controlPointsSlot;
    if (!groups.has(key)) {
      groups.set(
        key,
        createTopologyGroup(metadata.topologyId, controlPointsSlot, header.vertexCount, header.flags),
      );
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
 * and emitting one DrawPathInstancesOp per group.
 *
 * @param step - Render step with per-instance shapes
 * @param shapeBuffer - Shape-handle buffer (Float32Array holding ShapeBank handles)
 * @param fullPosition - Full position buffer
 * @param fullColor - Full color buffer
 * @param projectionScale - Uniform projection scale
 * @param isotropicScale - Optional per-instance isotropic scale (stride 1)
 * @param count - Instance count
 * @param context - Assembly context (includes camera, arena)
 * Appends DrawPathInstancesOp operations to `outOps`.
 */
function assemblePerInstanceShapes(
  step: StepRender,
  shapeBuffer: Float32Array,
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  projectionScale: number,
  isotropicScale: Float32Array | undefined,
  count: number,
  context: AssemblerContext,
  outOps: DrawOp[],
): void {
  const { program, state, arena, slotToArena } = context;
  const t0 = performance.now();

  // Group instances by topology
  const groups = groupInstancesByTopology(shapeBuffer, count, state);

  const tGrouped = performance.now();

  // C-13: Read rotation and scale2 from slots if present
  const fullRotation = step.rotationSlot
    ? (resolveNumericSlotBuffer(step.rotationSlot, state, slotToArena, arena, count) as Float32Array)
    : undefined;

  const fullScale2 = step.scale2Slot
    ? (resolveNumericSlotBuffer(step.scale2Slot, state, slotToArena, arena, count) as Float32Array)
    : undefined;

  // Run projection using resolved camera params
  const resolved = context.resolvedCamera;
  if (fullPosition.length !== count * 3) {
    throw new Error(
      'RenderAssembler: Position buffer must be world-space vec3 (stride 3). ' +
      'Expected length ' + (count * 3) + ', got ' + fullPosition.length + '. ' +
      'Fix upstream: insert/compile an explicit pos2→pos3 adapter; RenderAssembler will not promote stride-2.'
    );
  }

  const projection = projectInstances(fullPosition, projectionScale, count, resolved, arena, _projectionOutputScratch);

  for (const group of groups.values()) {
    // Skip empty groups
    if (group.instanceIndices.length === 0) {
      continue;
    }

    // Validate topology exists (group-level validation, not per-instance)
    const topology = getProgramTopology(program, group.topologyId);

    // Slice RGBA color for this group (position is not needed post-projection)
    const color = sliceColorBuffer(fullColor, group.instanceIndices, arena);

    // C-13: Slice rotation and scale2 if present
    const rotation = fullRotation
      ? sliceRotationBuffer(fullRotation, group.instanceIndices, arena)
      : undefined;

    const scale2 = fullScale2
      ? sliceScale2Buffer(fullScale2, group.instanceIndices, arena)
      : undefined;

    const groupIsotropicScale = isotropicScale
      ? sliceScalarBuffer(isotropicScale, group.instanceIndices, arena)
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

    const compactedCopy = depthSortAndCompactBuffers(
      groupScreenPos,
      groupScreenRadius,
      groupDepth,
      groupVisible,
      groupN,
      color,
      arena,
      rotation,
      scale2,
      groupIsotropicScale,
    );

    // [LAW:dataflow-not-control-flow] Culling variability is expressed as data (`count`).
    // The assembler emits no draw op when a group has zero visible instances.
    if (compactedCopy.count === 0) {
      continue;
    }

    const instanceTransforms = createInstanceTransforms(compactedCopy);
    const compactedColor = compactedCopy.color as Uint8ClampedArray;

    // Build style (shared by both path and primitive)
    const style = buildPathStyle(compactedColor, 'nonzero');

    if (!isPathTopology(topology)) {
      throw new Error(
        'RenderAssembler: topology ' + group.topologyId + ' is not path-renderable'
      );
    }

    let arenaControlPointsBuffer: Float32Array;
    try {
      arenaControlPointsBuffer = resolveNumericSlotBuffer(
        group.controlPointsSlot as ValueSlot,
        state,
        slotToArena,
        arena,
      ) as Float32Array;
    } catch {
      throw new Error(
        'RenderAssembler: Control points buffer not found for topology ' + group.topologyId + ' ' +
        '(slot ' + group.controlPointsSlot + ', instances: ' + group.instanceIndices.join(', ') + ')'
      );
    }

    if (!(arenaControlPointsBuffer instanceof Float32Array)) {
      throw new Error(
        'RenderAssembler: Control points buffer not found for topology ' + group.topologyId + ' ' +
        '(slot ' + group.controlPointsSlot + ', instances: ' + group.instanceIndices.join(', ') + ')'
      );
    }

    const geometry = createPathGeometry(group, topology, arenaControlPointsBuffer);
    outOps.push(createDrawPathInstancesOp(geometry, instanceTransforms, style));
  }

  const tSliced = performance.now();

  // Record timing to health metrics
  recordAssemblerTiming(state, {
    groupingMs: tGrouped - t0,
    slicingMs: tSliced - tGrouped,
    totalMs: tSliced - t0,
  });
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

function sliceScalarBuffer(
  fullValues: Float32Array,
  instanceIndices: number[],
  arena: RenderBufferArena,
): Float32Array {
  const N = instanceIndices.length;
  if (isContiguous(instanceIndices)) {
    const start = instanceIndices[0];
    return fullValues.subarray(start, start + N);
  }
  const values = arena.allocF32(N);
  for (let i = 0; i < N; i++) {
    values[i] = fullValues[instanceIndices[i]];
  }
  return values;
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
  return {
    topologyId: resolvedShape.topologyId,
    verbs: resolvedShape.verbs,
    points: controlPoints,
    pointsCount: controlPoints.length / 2,
    flags: resolvedShape.params.closed ? 1 : 0,
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
  rotation: Float32Array,
  scale2: Float32Array,
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
 * SUPPORTS PROJECTION: When camera is present, applies 3D projection and depth-sorting.
 *
 * @param step - The render step to assemble
 * @param context - Assembly context with one-cardinality values, instances, state, and arena
 * Appends DrawPathInstancesOp operations to `outOps`.
 */
function appendDrawPathInstancesOp(
  step: StepRender,
  context: AssemblerContext,
  outOps: DrawOp[],
): void {
  const { scalarExprToArenaAddress, slotToArena, instances, state, arena, pureFnContext } = context;

  // Get instance declaration
  const instance = instances.get(step.instanceId);
  if (!instance) {
    throw new Error(
      'RenderAssembler: Instance ' + step.instanceId + ' not found in state.instances. ' +
      'This indicates a compilation error where StepRender references an undeclared instance.'
    );
  }

  // Resolve count from instance
  const count = resolveInstanceLaneCount(instance, context.program, state, pureFnContext);
  if (count === 0) {
    return;
  }

  // Read position buffer from slot
  const packedPositionBuffer = resolveNumericSlotBuffer(step.controlPointsSlot, state, slotToArena, arena, count);
  if (!packedPositionBuffer) {
    throw new Error('RenderAssembler: Position buffer not found in slot ' + step.controlPointsSlot);
  }

  // Position must be Float32Array for v2
  if (!(packedPositionBuffer instanceof Float32Array)) {
    throw new Error(
      'RenderAssembler: Position buffer must be Float32Array, got ' + packedPositionBuffer.constructor.name
    );
  }
  const worldPositionBuffer = ensureWorldPositionVec3(packedPositionBuffer, count, arena);

  // Read color buffer from slot
  const rawColorBuffer = resolveNumericSlotBuffer(step.colorSlot, state, slotToArena, arena, count);
  if (!rawColorBuffer) {
    throw new Error('RenderAssembler: Color buffer not found in slot ' + step.colorSlot);
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
      'RenderAssembler: Color buffer must be Float32Array or Uint8ClampedArray, got ' + rawColorBuffer.constructor.name
    );
  }

  const resolvedScale = resolveScale(step.scale, scalarExprToArenaAddress, state, slotToArena);
  const projectionScale = resolvedScale.kind === 'uniform' ? resolvedScale.value : 1;
  const isotropicScale = resolvedScale.kind === 'perInstance' ? resolvedScale.values : undefined;

  // Resolve shape
  const shape = resolveShape(step.shape, state, slotToArena);

  // Check if per-instance shapes (shape buffer)
  if (shape instanceof Float32Array) {
    // Per-instance shapes: group by topology and emit multiple ops
    assemblePerInstanceShapes(
      step,
      shape,
      worldPositionBuffer,
      colorBuffer,
      projectionScale,
      isotropicScale,
      count,
      context,  // Pass full context (includes camera and arena)
      outOps,
    );
    return;
  }

  // Uniform shape: resolve fully and emit single op
  const packedControlPointsBuffer = resolveControlPoints(step.controlPoints, state, slotToArena, arena);
  const resolvedShape = resolveShapeFully(context.program, shape, packedControlPointsBuffer);

  // C-13: Read rotation and scale2 from slots if present
  const rotation = step.rotationSlot
    ? (resolveNumericSlotBuffer(step.rotationSlot, state, slotToArena, arena, count) as Float32Array)
    : undefined;

  const scale2 = step.scale2Slot
    ? (resolveNumericSlotBuffer(step.scale2Slot, state, slotToArena, arena, count) as Float32Array)
    : undefined;

  // Run projection using resolved camera params
  {
    // Run projection using resolved camera params
    // Project, compact, and copy in one step (uses arena from context)
    const compactedCopy = projectAndCompact(
      worldPositionBuffer,
      projectionScale,
      count,
      colorBuffer,
      context.resolvedCamera,
      arena,
      rotation,
      scale2,
      isotropicScale,
    );

    // [LAW:dataflow-not-control-flow] Visibility compaction owns the draw cardinality.
    // Zero visible instances means no op is emitted.
    if (compactedCopy.count === 0) {
      return;
    }

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

    if (!packedControlPointsBuffer || !(packedControlPointsBuffer instanceof Float32Array)) {
      throw new Error(
        'RenderAssembler: Path topology requires control points buffer (Float32Array)'
      );
    }

    const geometry = buildPathGeometry(resolvedShape, packedControlPointsBuffer);

    outOps.push({
      kind: 'drawPathInstances',
      geometry,
      instances: instanceTransforms,
      style,
    });
    return;
  }
}

export function assembleDrawPathInstancesOp(
  step: StepRender,
  context: AssemblerContext,
): DrawOp[] {
  const ops: DrawOp[] = [];
  appendDrawPathInstancesOp(step, context, ops);
  return ops;
}

/**
 * Assemble all render steps into a v2 RenderFrameIR
 *
 * This produces the target v2 frame structure with explicit draw operations.
 * Unlike v1, this uses local-space geometry with world-space instance transforms.
 *
 * NOW SUPPORTS PER-INSTANCE SHAPES: Multiple ops can be emitted per render step.
 * Path-only: emits DrawPathInstancesOp operations.
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
  if (renderSteps.length === 0) {
    return EMPTY_RENDER_FRAME;
  }

  const ops: DrawOp[] = [];

  for (const step of renderSteps) {
    appendDrawPathInstancesOp(step, context, ops);
  }

  if (ops.length === 0) {
    return EMPTY_RENDER_FRAME;
  }

  return {
    version: 2,
    ops,
  };
}
