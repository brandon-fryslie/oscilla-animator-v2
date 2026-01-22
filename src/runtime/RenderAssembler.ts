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

  return {
    kind: 'instances2d',
    count,
    position,
    color,
    scale,
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

  // Note: topologyId is currently string, but PathGeometry expects number
  // This is a known gap documented in the planning files
  const topologyId = resolvedShape.topologyId as unknown as number;

  return {
    topologyId,
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
 * @param position - Position buffer (x,y interleaved, normalized [0,1])
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
 * Assemble a DrawPathInstancesOp from a render step
 *
 * This is the v2 assembly path that produces explicit geometry/instances/style
 * structures. Unlike v1, this separates concerns and uses local-space geometry.
 *
 * @param step - The render step to assemble
 * @param context - Assembly context with signals, instances, and state
 * @returns DrawPathInstancesOp or null if assembly fails or shape is not a path
 */
export function assembleDrawPathInstancesOp(
  step: StepRender,
  context: AssemblerContext
): DrawPathInstancesOp | null {
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

  // Read control points buffer if present
  const controlPointsBuffer = resolveControlPoints(step.controlPoints, state);

  // Fully resolve shape
  const resolvedShape = resolveShapeFully(shape, controlPointsBuffer);

  // V2 only supports path topologies (primitives will be handled separately)
  if (resolvedShape.mode !== 'path') {
    // For now, return null for primitive topologies
    // Future work: DrawPrimitiveInstancesOp
    return null;
  }

  // Control points are required for path rendering
  if (!controlPointsBuffer || !(controlPointsBuffer instanceof Float32Array)) {
    throw new Error(
      'RenderAssembler: Path topology requires control points buffer (Float32Array)'
    );
  }

  // Build v2 structures
  const geometry = buildPathGeometry(resolvedShape, controlPointsBuffer);
  const instanceTransforms = buildInstanceTransforms(
    count,
    positionBuffer,
    scale,
    undefined, // rotation - not yet wired through IR
    undefined  // scale2 - not yet wired through IR
  );
  const style = buildPathStyle(colorBuffer, 'nonzero');

  return {
    kind: 'drawPathInstances',
    geometry,
    instances: instanceTransforms,
    style,
  };
}

/**
 * Assemble all render steps into a v2 RenderFrameIR_Future
 *
 * This produces the target v2 frame structure with explicit draw operations.
 * Unlike v1, this uses local-space geometry with world-space instance transforms.
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
    const op = assembleDrawPathInstancesOp(step, context);
    if (op) {
      ops.push(op);
    }
  }

  return {
    version: 2,
    ops,
  };
}
