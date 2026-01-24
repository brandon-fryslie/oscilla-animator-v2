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
 * CURRENT STATE (v1): Produces RenderPassIR with ShapeDescriptor
 * FUTURE STATE (v2): Produces DrawPathInstancesOp (see future-types.ts)
 */

import type { RenderPassIR, ShapeDescriptor, ResolvedShape } from './ScheduleExecutor';
import type { StepRender, InstanceDecl, SigExpr } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { evaluateSignal } from './SignalEvaluator';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef, TopologyDef, TopologyId } from '../shapes/types';
import type {
  DrawPathInstancesOp,
  PathGeometry,
  InstanceTransforms,
  PathStyle,
  RenderFrameIR_Future,
} from '../render/future-types';
import { SHAPE2D_WORDS, Shape2DWord, type Shape2DRecord, readShape2D } from './RuntimeState';
import type { ValueSlot } from '../types';
import {
  projectFieldOrtho,
  projectFieldRadiusOrtho,
  ORTHO_CAMERA_DEFAULTS,
  type OrthoCameraParams,
} from '../projection/ortho-kernel';
import {
  projectFieldPerspective,
  projectFieldRadiusPerspective,
  PERSP_CAMERA_DEFAULTS,
  type PerspectiveCameraParams,
} from '../projection/perspective-kernel';

// =============================================================================
// Projection Types
// =============================================================================

/**
 * Projection mode: viewer-level variable (NOT stored in compiled state).
 * Selects which kernel the RenderAssembler calls each frame.
 * Changing this requires zero reconstruction — just a different code path.
 */
export type ProjectionMode = 'orthographic' | 'perspective';

/**
 * Camera parameters for projection (union of ortho and perspective).
 */
export type CameraParams =
  | { mode: 'orthographic'; params: OrthoCameraParams }
  | { mode: 'perspective'; params: PerspectiveCameraParams };

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
 * Project world-space instances to screen-space.
 *
 * This is the projection stage called by the RenderAssembler.
 * World-space buffers are READ-ONLY — output is written to separate buffers.
 *
 * @param worldPositions - World-space vec3 positions (Float32Array, stride 3). READ-ONLY.
 * @param worldRadius - Uniform world-space radius for all instances
 * @param count - Number of instances
 * @param camera - Camera parameters (mode + params)
 * @returns Separate screen-space output buffers
 */
export function projectInstances(
  worldPositions: Float32Array,
  worldRadius: number,
  count: number,
  camera: CameraParams,
): ProjectionOutput {
  // Allocate output buffers (separate from world-space inputs)
  const screenPosition = new Float32Array(count * 2);
  const screenRadius = new Float32Array(count);
  const depth = new Float32Array(count);
  const visible = new Uint8Array(count);

  // Uniform radii input for field radius projection
  const worldRadii = new Float32Array(count);
  worldRadii.fill(worldRadius);

  if (camera.mode === 'orthographic') {
    projectFieldOrtho(worldPositions, count, camera.params, screenPosition, depth, visible);
    projectFieldRadiusOrtho(worldRadii, worldPositions, count, camera.params, screenRadius);
  } else {
    projectFieldPerspective(worldPositions, count, camera.params, screenPosition, depth, visible);
    projectFieldRadiusPerspective(worldRadii, worldPositions, count, camera.params, screenRadius);
  }

  return { screenPosition, screenRadius, depth, visible };
}

/**
 * AssemblerContext - Context needed for render assembly
 */
export interface AssemblerContext {
  /** Signal expression nodes */
  signals: readonly SigExpr[];
  /** Instance declarations */
  instances: ReadonlyMap<string, InstanceDecl>;
  /** Runtime state for reading slots and evaluating signals */
  state: RuntimeState;
  /** Camera params for projection (optional — if omitted, no projection is performed) */
  camera?: CameraParams;
}

/**
 * Assemble a single render pass from a render step
 *
 * @param step - The render step to assemble
 * @param context - Assembly context with signals, instances, and state
 * @returns RenderPassIR or null if assembly fails
 */
export function assembleRenderPass(
  step: StepRender,
  context: AssemblerContext
): RenderPassIR | null {
  const { signals, instances, state } = context;

  // Get instance declaration
  const instance = instances.get(step.instanceId);
  if (!instance) {
    console.warn(`RenderAssembler: Instance ${step.instanceId} not found`);
    return null;
  }

  // Resolve count from instance
  const count = typeof instance.count === 'number' ? instance.count : 0;
  if (count === 0) {
    return null; // Empty instance, skip
  }

  // Read position buffer from slot
  const position = state.values.objects.get(step.positionSlot) as ArrayBufferView;
  if (!position) {
    throw new Error(`RenderAssembler: Position buffer not found in slot ${step.positionSlot}`);
  }

  // Read color buffer from slot
  const color = state.values.objects.get(step.colorSlot) as ArrayBufferView;
  if (!color) {
    throw new Error(`RenderAssembler: Color buffer not found in slot ${step.colorSlot}`);
  }

  // Resolve scale (uniform signal, defaults to 1.0 from block registry)
  const scale = resolveScale(step.scale, signals, state);

  // Resolve shape (descriptor with topology or per-particle buffer)
  const shape = resolveShape(step.shape, signals, state);

  // Read control points buffer if present
  const controlPoints = resolveControlPoints(step.controlPoints, state);

  // Fully resolve shape for renderer (includes topology lookup)
  const resolvedShape = resolveShapeFully(shape, controlPoints);

  // C-13: Read rotation and scale2 from slots if present
  const rotation = step.rotationSlot
    ? (state.values.objects.get(step.rotationSlot) as Float32Array | undefined)
    : undefined;

  const scale2 = step.scale2Slot
    ? (state.values.objects.get(step.scale2Slot) as Float32Array | undefined)
    : undefined;

  // Run projection if camera is provided
  const camera = context.camera;
  if (camera && position instanceof Float32Array) {
    // Determine position stride: vec3 (stride 3) or vec2 (stride 2, promote to vec3 with z=0)
    const posLength = position.length;
    let worldPos3: Float32Array;
    if (posLength === count * 3) {
      // Already stride-3 vec3
      worldPos3 = position;
    } else {
      // Stride-2 vec2: promote to vec3 with z=0
      worldPos3 = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        worldPos3[i * 3] = position[i * 2];
        worldPos3[i * 3 + 1] = position[i * 2 + 1];
        // worldPos3[i * 3 + 2] = 0 (Float32Array is zero-initialized)
      }
    }

    const projection = projectInstances(worldPos3, scale, count, camera);
    return {
      kind: 'instances2d',
      count,
      position, // Original world-space position (preserved, not mutated)
      color,
      scale,
      rotation,  // C-13: Include rotation if present
      scale2,    // C-13: Include scale2 if present
      resolvedShape,
      screenPosition: projection.screenPosition,
      screenRadius: projection.screenRadius,
      depth: projection.depth,
      visible: projection.visible,
    };
  }

  return {
    kind: 'instances2d',
    count,
    position,
    color,
    scale,
    rotation,  // C-13: Include rotation if present
    scale2,    // C-13: Include scale2 if present
    resolvedShape, // Pre-resolved shape data for renderer
  };
}

/**
 * Resolve scale from step specification
 *
 * Scale is a uniform multiplier for shape dimensions.
 * MUST be provided - no fallback values in render pipeline.
 */
function resolveScale(
  scaleSpec: StepRender['scale'],
  signals: readonly SigExpr[],
  state: RuntimeState
): number {
  if (scaleSpec === undefined) {
    throw new Error(
      'RenderAssembler: scale is required. ' +
      'Ensure RenderInstances2D block has a scale input (default 1.0 from registry).'
    );
  }

  if (scaleSpec.k === 'sig') {
    return evaluateSignal(scaleSpec.id, signals, state);
  } else {
    throw new Error(
      `RenderAssembler: scale must be a signal, got ${scaleSpec.k}. ` +
      'Per-particle scale is not supported.'
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
  signals: readonly SigExpr[],
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
    // Signal ('sig') with topology - evaluate param signals and build descriptor
    const { topologyId, paramSignals } = shapeSpec;
    const params: Record<string, number> = {};

    for (let i = 0; i < paramSignals.length; i++) {
      const value = evaluateSignal(paramSignals[i], signals, state);
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
      verbs: new Uint8Array(topology.verbs),
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
 * Assemble all render passes from render steps
 *
 * @param renderSteps - Array of render steps to assemble
 * @param context - Assembly context
 * @returns Array of assembled render passes
 */
export function assembleAllPasses(
  renderSteps: readonly StepRender[],
  context: AssemblerContext
): RenderPassIR[] {
  const passes: RenderPassIR[] = [];

  for (const step of renderSteps) {
    const pass = assembleRenderPass(step, context);
    if (pass) {
      passes.push(pass);
    }
  }

  return passes;
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
 * Sliced instance buffers for a topology group
 */
interface SlicedBuffers {
  position: Float32Array;
  color: Uint8ClampedArray;
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
 * Slice instance buffers for a topology group
 *
 * Extracts position and color data for instances in the group.
 * Uses zero-copy subarray views when indices are contiguous,
 * falls back to copy for non-contiguous indices.
 *
 * @param fullPosition - Full position buffer (x,y,z interleaved)
 * @param fullColor - Full color buffer (RGBA interleaved)
 * @param instanceIndices - Sorted indices of instances to extract
 * @returns Sliced position and color buffers
 */
export function sliceInstanceBuffers(
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  instanceIndices: number[]
): SlicedBuffers {
  const N = instanceIndices.length;

  if (isContiguous(instanceIndices)) {
    // Zero-copy views — same underlying ArrayBuffer
    const start = instanceIndices[0];
    return {
      position: fullPosition.subarray(start * 3, (start + N) * 3),
      color: fullColor.subarray(start * 4, (start + N) * 4),
    };
  }

  // Non-contiguous: copy (existing logic)
  const position = new Float32Array(N * 3);  // vec3 per instance
  const color = new Uint8ClampedArray(N * 4); // RGBA per instance

  for (let i = 0; i < N; i++) {
    const srcIdx = instanceIndices[i];

    // Position (x, y, z)
    position[i * 3]     = fullPosition[srcIdx * 3];
    position[i * 3 + 1] = fullPosition[srcIdx * 3 + 1];
    position[i * 3 + 2] = fullPosition[srcIdx * 3 + 2];

    // Color (R, G, B, A)
    color[i * 4]     = fullColor[srcIdx * 4];
    color[i * 4 + 1] = fullColor[srcIdx * 4 + 1];
    color[i * 4 + 2] = fullColor[srcIdx * 4 + 2];
    color[i * 4 + 3] = fullColor[srcIdx * 4 + 3];
  }

  return { position, color };
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
 * Assemble DrawPathInstancesOp operations for per-instance shapes
 *
 * Handles the `{ k: 'slot' }` shape case by grouping instances by topology
 * and emitting one DrawPathInstancesOp per group.
 *
 * @param step - Render step with per-instance shapes
 * @param shapeBuffer - Shape2D buffer (Uint32Array)
 * @param fullPosition - Full position buffer
 * @param fullColor - Full color buffer
 * @param scale - Uniform scale
 * @param count - Instance count
 * @param state - Runtime state
 * @returns Array of DrawPathInstancesOp operations
 */
function assemblePerInstanceShapes(
  step: StepRender,
  shapeBuffer: Uint32Array,
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  scale: number,
  count: number,
  state: RuntimeState
): DrawPathInstancesOp[] {
  const t0 = performance.now();

  // Group instances by topology
  const groups = groupInstancesByTopology(shapeBuffer, count);

  const tGrouped = performance.now();

  const ops: DrawPathInstancesOp[] = [];

  // C-13: Read rotation and scale2 from slots if present
  const fullRotation = step.rotationSlot
    ? (state.values.objects.get(step.rotationSlot) as Float32Array | undefined)
    : undefined;

  const fullScale2 = step.scale2Slot
    ? (state.values.objects.get(step.scale2Slot) as Float32Array | undefined)
    : undefined;

  for (const [key, group] of groups) {
    // Skip empty groups
    if (group.instanceIndices.length === 0) {
      continue;
    }

    // Validate topology exists (group-level validation, not per-instance)
    const topology = getTopology(group.topologyId);

    if (!isPathTopology(topology)) {
      console.warn(
        `RenderAssembler: Non-path topology ${group.topologyId} not yet supported ` +
        `(instances: ${group.instanceIndices.join(', ')})`
      );
      continue; // Skip non-path topologies
    }

    // Get control points buffer for this group
    const controlPointsBuffer = state.values.objects.get(
      group.controlPointsSlot as ValueSlot
    ) as Float32Array;

    if (!controlPointsBuffer || !(controlPointsBuffer instanceof Float32Array)) {
      throw new Error(
        `RenderAssembler: Control points buffer not found for topology ${group.topologyId} ` +
        `(slot ${group.controlPointsSlot}, instances: ${group.instanceIndices.join(', ')})`
      );
    }

    // Slice instance buffers for this group
    const { position, color } = sliceInstanceBuffers(
      fullPosition,
      fullColor,
      group.instanceIndices
    );

    // C-13: Slice rotation and scale2 if present
    const rotation = fullRotation
      ? sliceRotationBuffer(fullRotation, group.instanceIndices)
      : undefined;

    const scale2 = fullScale2
      ? sliceScale2Buffer(fullScale2, group.instanceIndices)
      : undefined;

    // Build geometry
    const geometry: PathGeometry = {
      topologyId: group.topologyId,
      verbs: new Uint8Array(topology.verbs),
      points: controlPointsBuffer,
      pointsCount: group.pointsCount,
      flags: group.flags,
    };

    // Build instance transforms
    const instanceTransforms: InstanceTransforms = {
      count: group.instanceIndices.length,
      position,
      size: scale, // Uniform scale
      rotation,  // C-13: Include rotation if present
      scale2,    // C-13: Include scale2 if present
    };

    // Build style
    const style: PathStyle = {
      fillColor: color,
      fillRule: 'nonzero',
    };

    ops.push({
      kind: 'drawPathInstances',
      geometry,
      instances: instanceTransforms,
      style,
    });
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
 *
 * @param fullRotation - Full rotation buffer (Float32Array, one value per instance)
 * @param instanceIndices - Indices of instances to extract
 * @returns Sliced rotation buffer
 */
function sliceRotationBuffer(
  fullRotation: Float32Array,
  instanceIndices: number[]
): Float32Array {
  const N = instanceIndices.length;

  if (isContiguous(instanceIndices)) {
    // Zero-copy view
    const start = instanceIndices[0];
    return fullRotation.subarray(start, start + N);
  }

  // Non-contiguous: copy
  const rotation = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    rotation[i] = fullRotation[instanceIndices[i]];
  }
  return rotation;
}

/**
 * Slice scale2 buffer for a topology group
 *
 * C-13: Helper to extract per-instance anisotropic scales for a subset of instances.
 *
 * @param fullScale2 - Full scale2 buffer (Float32Array, x,y pairs per instance)
 * @param instanceIndices - Indices of instances to extract
 * @returns Sliced scale2 buffer
 */
function sliceScale2Buffer(
  fullScale2: Float32Array,
  instanceIndices: number[]
): Float32Array {
  const N = instanceIndices.length;

  if (isContiguous(instanceIndices)) {
    // Zero-copy view
    const start = instanceIndices[0];
    return fullScale2.subarray(start * 2, (start + N) * 2);
  }

  // Non-contiguous: copy
  const scale2 = new Float32Array(N * 2);
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
 * Build InstanceTransforms from render step data
 *
 * Constructs world-space instance transform data.
 * Position is in normalized [0,1] space.
 * Size is isotropic scale (combined with optional scale2 for anisotropic).
 *
 * @param count - Number of instances
 * @param position - Position buffer (x,y,z interleaved, normalized [0,1])
 * @param size - Uniform size or per-instance sizes (isotropic scale)
 * @param rotation - Optional per-instance rotations (radians)
 * @param scale2 - Optional per-instance anisotropic scale (x,y interleaved)
 * @returns InstanceTransforms structure for v2 rendering
 */
function buildInstanceTransforms(
  count: number,
  position: Float32Array,
  size: number,
  rotation?: Float32Array,
  scale2?: Float32Array
): InstanceTransforms {
  return {
    count,
    position,
    size,
    rotation,
    scale2,
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
 * Assemble DrawPathInstancesOp operations from a render step
 *
 * This is the v2 assembly path that produces explicit geometry/instances/style
 * structures. Unlike v1, this separates concerns and uses local-space geometry.
 *
 * NOW SUPPORTS PER-INSTANCE SHAPES: When shape is a buffer (`{ k: 'slot' }`),
 * instances are grouped by topology and multiple ops are emitted.
 *
 * @param step - The render step to assemble
 * @param context - Assembly context with signals, instances, and state
 * @returns Array of DrawPathInstancesOp operations (one or more)
 */
export function assembleDrawPathInstancesOp(
  step: StepRender,
  context: AssemblerContext
): DrawPathInstancesOp[] {
  const { signals, instances, state } = context;

  // Get instance declaration
  const instance = instances.get(step.instanceId);
  if (!instance) {
    console.warn(`RenderAssembler: Instance ${step.instanceId} not found`);
    return [];
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
  const colorBuffer = state.values.objects.get(step.colorSlot) as ArrayBufferView;
  if (!colorBuffer) {
    throw new Error(`RenderAssembler: Color buffer not found in slot ${step.colorSlot}`);
  }

  // Color must be Uint8ClampedArray for v2
  if (!(colorBuffer instanceof Uint8ClampedArray)) {
    throw new Error(
      `RenderAssembler: Color buffer must be Uint8ClampedArray, got ${colorBuffer.constructor.name}`
    );
  }

  // Resolve scale (uniform signal)
  const scale = resolveScale(step.scale, signals, state);

  // Resolve shape
  const shape = resolveShape(step.shape, signals, state);

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
      state
    );
  }

  // Uniform shape: existing single-op path
  const controlPointsBuffer = resolveControlPoints(step.controlPoints, state);
  const resolvedShape = resolveShapeFully(shape, controlPointsBuffer);

  // V2 only supports path topologies (primitives will be handled separately)
  if (resolvedShape.mode !== 'path') {
    // For now, return empty array for primitive topologies
    // Future work: DrawPrimitiveInstancesOp
    return [];
  }

  // Control points are required for path rendering
  if (!controlPointsBuffer || !(controlPointsBuffer instanceof Float32Array)) {
    throw new Error(
      'RenderAssembler: Path topology requires control points buffer (Float32Array)'
    );
  }

  // C-13: Read rotation and scale2 from slots if present
  const rotation = step.rotationSlot
    ? (state.values.objects.get(step.rotationSlot) as Float32Array | undefined)
    : undefined;

  const scale2 = step.scale2Slot
    ? (state.values.objects.get(step.scale2Slot) as Float32Array | undefined)
    : undefined;

  // Build v2 structures
  const geometry = buildPathGeometry(resolvedShape, controlPointsBuffer);
  const instanceTransforms = buildInstanceTransforms(
    count,
    positionBuffer,
    scale,
    rotation,  // C-13: Include rotation if present
    scale2     // C-13: Include scale2 if present
  );
  const style = buildPathStyle(colorBuffer, 'nonzero');

  return [{
    kind: 'drawPathInstances',
    geometry,
    instances: instanceTransforms,
    style,
  }];
}

/**
 * Assemble all render steps into a v2 RenderFrameIR_Future
 *
 * This produces the target v2 frame structure with explicit draw operations.
 * Unlike v1, this uses local-space geometry with world-space instance transforms.
 *
 * NOW SUPPORTS PER-INSTANCE SHAPES: Multiple ops can be emitted per render step.
 *
 * @param renderSteps - Array of render steps to assemble
 * @param context - Assembly context
 * @returns RenderFrameIR_Future with DrawPathInstancesOp operations
 */
export function assembleRenderFrame_v2(
  renderSteps: readonly StepRender[],
  context: AssemblerContext
): RenderFrameIR_Future {
  const ops: DrawPathInstancesOp[] = [];

  for (const step of renderSteps) {
    const stepOps = assembleDrawPathInstancesOp(step, context);
    ops.push(...stepOps);  // Flatten array of ops from each step
  }

  return {
    version: 2,
    ops,
  };
}
