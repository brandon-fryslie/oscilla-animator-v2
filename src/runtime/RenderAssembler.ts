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
 * FUTURE STATE (v2): Will produce DrawPathInstancesOp (see future-types.ts)
 */

import type { RenderPassIR, ShapeDescriptor, ResolvedShape } from './ScheduleExecutor';
import type { StepRender, InstanceDecl, SigExpr } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { evaluateSignal } from './SignalEvaluator';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef, TopologyDef, TopologyId } from '../shapes/types';

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

  // Resolve size (uniform signal or per-particle buffer)
  const size = resolveSize(step.size, signals, state);

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
    size,
    shape, // @deprecated - kept for backward compatibility
    resolvedShape, // REQUIRED - renderer uses this
  };
}

/**
 * Resolve size from step specification
 */
function resolveSize(
  sizeSpec: StepRender['size'],
  signals: readonly SigExpr[],
  state: RuntimeState
): number | ArrayBufferView {
  if (sizeSpec === undefined) {
    return 10; // Default size
  }

  if (sizeSpec.k === 'slot') {
    const sizeBuffer = state.values.objects.get(sizeSpec.slot) as ArrayBufferView;
    if (!sizeBuffer) {
      throw new Error(`RenderAssembler: Size buffer not found in slot ${sizeSpec.slot}`);
    }
    return sizeBuffer;
  } else {
    // Signal ('sig') - evaluate for uniform size
    return evaluateSignal(sizeSpec.id, signals, state);
  }
}

/**
 * Resolve shape from step specification
 */
function resolveShape(
  shapeSpec: StepRender['shape'],
  signals: readonly SigExpr[],
  state: RuntimeState
): ShapeDescriptor | ArrayBufferView | number {
  if (shapeSpec === undefined) {
    return 0; // Default shape (circle, legacy encoding)
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
 * All shapes are resolved to proper topologies - no legacy numeric encoding.
 *
 * @param shape - Shape descriptor, buffer, or legacy encoding
 * @param controlPoints - Optional control points for path shapes
 * @returns ResolvedShape for renderer
 */
function resolveShapeFully(
  shape: ShapeDescriptor | ArrayBufferView | number,
  controlPoints?: ArrayBufferView
): ResolvedShape {
  // Legacy numeric encoding - convert to proper topology
  if (typeof shape === 'number') {
    // Map legacy encodings to actual topologies:
    // 0 = circle -> ellipse with equal radii
    // 1 = square -> rect with equal width/height
    // 2 = triangle -> polygon (not yet implemented, fallback to ellipse)
    const topologyId = shape === 1 ? 'rect' : 'ellipse';
    const topology = getTopology(topologyId as TopologyId);

    // Build params with defaults
    const params: Record<string, number> = {};
    topology.params.forEach((paramDef) => {
      params[paramDef.name] = paramDef.default;
    });

    return {
      resolved: true,
      topologyId: topologyId as TopologyId,
      mode: 'primitive',
      params,
    };
  }

  // Per-particle shape buffer (Field<shape>) - not yet fully supported
  // Fall back to ellipse (circle) for now
  if (!isShapeDescriptor(shape)) {
    const topology = getTopology('ellipse' as TopologyId);
    const params: Record<string, number> = {};
    topology.params.forEach((paramDef) => {
      params[paramDef.name] = paramDef.default;
    });

    return {
      resolved: true,
      topologyId: 'ellipse' as TopologyId,
      mode: 'primitive',
      params,
    };
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
