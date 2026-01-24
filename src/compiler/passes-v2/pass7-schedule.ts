/**
 * Pass 7: Schedule Construction
 *
 * Builds execution schedule with explicit phase ordering:
 * 1. Update rails/time inputs
 * 2. Execute continuous scalars (evalSig)
 * 3. Build continuity mappings (continuityMapBuild)
 * 4. Execute continuous fields (materialize)
 * 5. Apply continuity to field targets (continuityApply)
 * 6. Apply discrete ops (events)
 * 7. Sinks (render)
 * 8. State writes (stateWrite)
 *
 * The schedule respects data dependencies within each phase and provides
 * deterministic execution order.
 */

import type { Step, StepEvalEvent, StepRender, StepMaterialize, StepContinuityMapBuild, StepContinuityApply, TimeModel, InstanceId, InstanceDecl, FieldExprId, SigExprId, SigExpr, FieldExpr, ValueSlot, ContinuityPolicy, StateMapping, EventSlotId } from '../ir/types';
import type { EventExprId } from '../ir/Indices';
import type { UnlinkedIRFragments } from './pass6-block-lowering';
import type { AcyclicOrLegalGraph, NormalizedEdge, Block, BlockIndex } from '../ir/patches';
import type { TimeModelIR } from '../ir/schedule';
import type { ValueRefPacked } from '../ir/lowerTypes';
import type { TopologyId } from '../../shapes/types';
import { getBlockDefinition } from '../../blocks/registry';
import { getPolicyForSemantic } from '../../runtime/ContinuityDefaults';

// =============================================================================
// Schedule IR Types
// =============================================================================

/**
 * ScheduleIR - Complete execution schedule
 *
 * Contains everything the runtime needs to execute a frame:
 * - timeModel: Time configuration
 * - instances: Instance declarations (count, layout, etc)
 * - steps: Ordered execution steps
 * - stateSlotCount: Number of persistent state slots
 * - stateSlots: Initial values for state slots (legacy format)
 * - stateMappings: State mappings with stable IDs for hot-swap migration
 */
export interface ScheduleIR {
  /** Time model configuration */
  readonly timeModel: TimeModel;

  /** Instance declarations (instance ID → InstanceDecl) */
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;

  /** Ordered execution steps */
  readonly steps: readonly Step[];

  /** Number of persistent state slots */
  readonly stateSlotCount: number;

  /** Initial values for state slots (legacy format, use stateMappings for hot-swap) */
  readonly stateSlots: readonly StateSlotDef[];

  /** State mappings with stable IDs for hot-swap migration */
  readonly stateMappings: readonly StateMapping[];

  /** Number of event slots (for sizing eventScalars Uint8Array) */
  readonly eventSlotCount: number;

  /** Number of event expressions (for sizing eventPrevPredicate Uint8Array) */
  readonly eventExprCount: number;
}

/**
 * State slot definition
 */
export interface StateSlotDef {
  readonly initialValue: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find all render blocks in the validated graph.
 */
function findRenderBlocks(
  blocks: readonly Block[]
): Array<{ block: Block; index: BlockIndex }> {
  const result: Array<{ block: Block; index: BlockIndex }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const def = getBlockDefinition(block.type);
    if (def?.capability === 'render') {
      result.push({ block, index: i as BlockIndex });
    }
  }

  return result;
}

/**
 * Get the ValueRef for a specific input port of a block.
 * Traces through edges to find the source block's output.
 */
function getInputRef(
  blockIndex: BlockIndex,
  portId: string,
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>
): ValueRefPacked | undefined {
  // Find edge targeting this block.port
  const edge = edges.find(
    e => e.toBlock === blockIndex && e.toPort === portId
  );

  if (!edge) return undefined;

  // Look up source block's outputs
  const sourceOutputs = blockOutputs.get(edge.fromBlock);
  if (!sourceOutputs) return undefined;

  return sourceOutputs.get(edge.fromPort);
}

/**
 * Target info collected from render blocks.
 * Used to generate materialize → continuity → render chain.
 */
interface RenderTargetInfo {
  instanceId: InstanceId;
  position: FieldExprId;
  color: FieldExprId;
  scale?: { k: 'sig'; id: SigExprId };
  shape?: { k: 'sig'; id: SigExprId } | { k: 'field'; id: FieldExprId };
}

/**
 * Collect render target info from render blocks.
 * Instance is inferred from the position field, not grabbed blindly.
 */
function collectRenderTargets(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  fieldExprs: readonly FieldExpr[]
): RenderTargetInfo[] {
  const targets: RenderTargetInfo[] = [];
  const renderBlocks = findRenderBlocks(blocks);

  for (const { block, index } of renderBlocks) {
    // Trace inputs through edges to blockOutputs
    const posRef = getInputRef(index, 'pos', edges, blockOutputs);
    const colorRef = getInputRef(index, 'color', edges, blockOutputs);
    const scaleRef = getInputRef(index, 'scale', edges, blockOutputs);
    const shapeRef = getInputRef(index, 'shape', edges, blockOutputs);

    // Validate required inputs (position and color)
    if (posRef?.k !== 'field') {
      continue;
    }
    if (colorRef?.k !== 'field') {
      continue;
    }

    // Infer instance from position field (not first instance!)
    const instanceId = inferFieldInstanceFromExprs(posRef.id, fieldExprs);
    if (!instanceId) {
      continue;
    }

    // Build optional scale (uniform signal only - no per-particle scale)
    const scale = scaleRef?.k === 'sig' ? { k: 'sig' as const, id: scaleRef.id }
               : undefined;

    const shape = shapeRef?.k === 'field' ? { k: 'field' as const, id: shapeRef.id }
                : shapeRef?.k === 'sig' ? { k: 'sig' as const, id: shapeRef.id }
                : undefined;

    targets.push({
      instanceId,
      position: posRef.id,
      color: colorRef.id,
      scale,
      shape,
    });
  }

  return targets;
}

/**
 * Infer instance from a field expression by walking the expression tree.
 * Mirrors IRBuilderImpl.inferFieldInstance() logic.
 */
function inferFieldInstanceFromExprs(
  fieldId: FieldExprId,
  fieldExprs: readonly FieldExpr[]
): InstanceId | undefined {
  const expr = fieldExprs[fieldId as number];
  if (!expr) return undefined;

  switch (expr.kind) {
    case 'intrinsic':
    case 'array':
    case 'stateRead':
      return expr.instanceId;
    case 'map':
      return expr.instanceId ?? inferFieldInstanceFromExprs(expr.input, fieldExprs);
    case 'zip':
      // Take first input's instance (they should all match per validation)
      return expr.instanceId ?? (expr.inputs.length > 0 ? inferFieldInstanceFromExprs(expr.inputs[0], fieldExprs) : undefined);
    case 'zipSig':
      return expr.instanceId ?? inferFieldInstanceFromExprs(expr.field, fieldExprs);
    case 'broadcast':
    case 'const':
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Resolve shape info from a signal expression.
 * Returns topologyId, paramSignals, and optional controlPointField if the signal is a shapeRef.
 */
function resolveShapeInfo(
  sigId: SigExprId,
  signals: readonly SigExpr[]
): { topologyId: TopologyId; paramSignals: readonly SigExprId[]; controlPointField?: FieldExprId } | undefined {
  const expr = signals[sigId as number];
  if (!expr) return undefined;

  if (expr.kind === 'shapeRef') {
    return {
      topologyId: expr.topologyId,
      paramSignals: expr.paramSignals,
      controlPointField: expr.controlPointField, // P5b: Include control point field
    };
  }

  return undefined;
}

/**
 * Build the complete continuity pipeline:
 * 1. ContinuityMapBuild steps (one per instance)
 * 2. Materialize steps (one per field target)
 * 3. ContinuityApply steps (one per target)
 * 4. Render steps (read from output slots)
 *
 * Returns all steps needed for rendering with continuity.
 */
function buildContinuityPipeline(
  targets: RenderTargetInfo[],
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  signals: readonly SigExpr[],
  slotAllocator: () => ValueSlot
): {
  mapBuildSteps: StepContinuityMapBuild[];
  materializeSteps: StepMaterialize[];
  continuityApplySteps: StepContinuityApply[];
  renderSteps: StepRender[];
} {
  const mapBuildSteps: StepContinuityMapBuild[] = [];
  const materializeSteps: StepMaterialize[] = [];
  const continuityApplySteps: StepContinuityApply[] = [];
  const renderSteps: StepRender[] = [];

  // Track which instances we've already emitted mapBuild for
  const mapBuildEmitted = new Set<InstanceId>();

  // Track field→slot mappings to avoid duplicate materializations
  const fieldSlots = new Map<FieldExprId, { baseSlot: ValueSlot; outputSlot: ValueSlot }>();

  for (const target of targets) {
    const { instanceId, position, color, scale, shape } = target;

    // 1. Emit ContinuityMapBuild for this instance (if not already)
    if (!mapBuildEmitted.has(instanceId)) {
      mapBuildSteps.push({
        kind: 'continuityMapBuild',
        instanceId,
        outputMapping: `mapping_${instanceId}`,
      });
      mapBuildEmitted.add(instanceId);
    }

    // Helper to get or create slots for a field
    const getFieldSlots = (
      fieldId: FieldExprId,
      semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom'
    ): { baseSlot: ValueSlot; outputSlot: ValueSlot } => {
      // Create unique key including semantic to handle same field used for different purposes
      const key = fieldId;
      let slots = fieldSlots.get(key);
      if (!slots) {
        const baseSlot = slotAllocator();
        const outputSlot = slotAllocator();
        slots = { baseSlot, outputSlot };
        fieldSlots.set(key, slots);

        // 2. Emit Materialize step
        materializeSteps.push({
          kind: 'materialize',
          field: fieldId,
          instanceId,
          target: baseSlot,
        });

        // 3. Emit ContinuityApply step
        const policy = getPolicyForSemantic(semantic);
        const targetKey = `${instanceId}_${semantic}_${fieldId}`;
        continuityApplySteps.push({
          kind: 'continuityApply',
          targetKey,
          instanceId,
          policy,
          baseSlot,
          outputSlot,
          semantic,
        });
      }
      return slots;
    };

    // Process position (semantic: position)
    const posSlots = getFieldSlots(position, 'position');

    // Process color (semantic: color)
    const colorSlots = getFieldSlots(color, 'color');

    // Process scale (uniform signal only - no per-particle scale)
    let scaleOutput: StepRender['scale'] = undefined;
    if (scale) {
      // Scale is always a signal (uniform)
      scaleOutput = scale;
    }

    // Process shape (semantic: custom) if it's a field or signal
    let shapeOutput: StepRender['shape'] = undefined;
    let controlPointsOutput: StepRender['controlPoints'] = undefined;

    if (shape) {
      if (shape.k === 'field') {
        const shapeSlots = getFieldSlots(shape.id, 'custom');
        shapeOutput = { k: 'slot', slot: shapeSlots.outputSlot };
      } else {
        // Signal - resolve topology + param signals + control points
        const shapeInfo = resolveShapeInfo(shape.id, signals);
        if (shapeInfo) {
          shapeOutput = {
            k: 'sig',
            topologyId: shapeInfo.topologyId,
            paramSignals: shapeInfo.paramSignals,
          };

          // P5b: If shape has control point field, materialize it
          if (shapeInfo.controlPointField !== undefined) {
            const cpSlots = getFieldSlots(shapeInfo.controlPointField, 'custom');
            controlPointsOutput = { k: 'slot', slot: cpSlots.outputSlot };
          }
        }
      }
    }

    // 4. Create render step that reads from output slots
    const renderStep: StepRender = {
      kind: 'render',
      instanceId,
      positionSlot: posSlots.outputSlot,
      colorSlot: colorSlots.outputSlot,
      ...(scaleOutput && { scale: scaleOutput }),
      ...(shapeOutput && { shape: shapeOutput }),
      ...(controlPointsOutput && { controlPoints: controlPointsOutput }), // P5c: Add control points to render step
    };

    renderSteps.push(renderStep);
  }

  return { mapBuildSteps, materializeSteps, continuityApplySteps, renderSteps };
}

// =============================================================================
// Pass 7 Entry Point
// =============================================================================

/**
 * Pass 7: Schedule Construction
 *
 * Builds topologically-ordered execution schedule from unlinked IR fragments.
 * Now includes full continuity pipeline:
 * 1. ContinuityMapBuild (domain change detection)
 * 2. Materialize (field evaluation)
 * 3. ContinuityApply (gauge/slew/crossfade)
 * 4. Render (use continuity-applied values)
 *
 * @param unlinkedIR - Block IR fragments from Pass 6
 * @param validated - Validated graph with SCC information
 * @returns Execution schedule with phase ordering
 */
export function pass7Schedule(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph
): ScheduleIR {
  // Convert TimeModelIR to TimeModel
  const timeModel: TimeModel = convertTimeModel(validated.timeModel);

  // Get instances from IRBuilder
  const instances = unlinkedIR.builder.getInstances();

  // Create slot allocator - we need to allocate new slots for continuity buffers
  // Start from the current slot count from the builder
  let nextSlot = unlinkedIR.builder.getSlotCount();
  const slotAllocator = (): ValueSlot => {
    return nextSlot++ as ValueSlot;
  };

  // Get expressions for instance inference and shape resolution
  const fieldExprs = unlinkedIR.builder.getFieldExprs();
  const signals = unlinkedIR.builder.getSigExprs();

  // Collect render targets from render blocks (instance inferred from position field)
  const renderTargets = collectRenderTargets(
    validated.blocks,
    validated.edges,
    unlinkedIR.blockOutputs,
    instances,
    fieldExprs
  );

  // Build the complete continuity pipeline
  const {
    mapBuildSteps,
    materializeSteps,
    continuityApplySteps,
    renderSteps,
  } = buildContinuityPipeline(renderTargets, instances, signals, slotAllocator);

  // Collect steps from builder (stateWrite steps from stateful blocks)
  const builderSteps = unlinkedIR.builder.getSteps();

  // Generate evalSig steps for all signals with registered slots.
  // This enables the debug tap to record signal values for the debug probe.
  //
  // NOTE: Only Signal edges support debug probing. Field edges (arrays) use
  // `materialize` steps which don't have a tap point yet. Field visualization
  // requires different treatment (summary stats, spatial view) and is deferred
  // until after the field refactor.
  //
  // See: .agent_planning/debug-probe/README.md
  //
  // Signals that depend on eventRead must be evaluated AFTER events (Phase 5→6).
  // Pre-event signals go in Phase 1, post-event signals go after evalEvent.
  const sigSlots = unlinkedIR.builder.getSigSlots();
  const evalSigStepsPre: Step[] = [];
  const evalSigStepsPost: Step[] = [];
  for (const [sigId, slot] of sigSlots) {
    const step: Step = {
      kind: 'evalSig',
      expr: sigId as SigExprId,
      target: slot,
    };
    if (sigDependsOnEvent(sigId as number, signals)) {
      evalSigStepsPost.push(step);
    } else {
      evalSigStepsPre.push(step);
    }
  }

  // Generate evalEvent steps for all registered event slots.
  // Events are evaluated after continuityApply and before render.
  const eventSlots = unlinkedIR.builder.getEventSlots();
  const evalEventSteps: StepEvalEvent[] = [];
  for (const [eventId, eventSlot] of eventSlots) {
    evalEventSteps.push({
      kind: 'evalEvent',
      expr: eventId,
      target: eventSlot,
    });
  }

  // Combine all steps in correct execution order:
  // 1. EvalSig-pre (signals NOT dependent on events)
  // 2. ContinuityMapBuild (detect domain changes, compute mappings)
  // 3. Materialize (evaluate fields to buffers)
  // 4. ContinuityApply (apply gauge/slew/crossfade to buffers)
  // 5. EvalEvent (evaluate discrete events → eventScalars)
  // 6. EvalSig-post (signals that depend on eventRead)
  // 7. Render (use continuity-applied buffers)
  // 8. StateWrite (persist state for next frame)
  const steps: Step[] = [
    ...evalSigStepsPre,
    ...mapBuildSteps,
    ...materializeSteps,
    ...continuityApplySteps,
    ...evalEventSteps,
    ...evalSigStepsPost,
    ...renderSteps,
    ...builderSteps,
  ];

  // Get state slots from builder
  const stateSlotCount = unlinkedIR.builder.getStateSlotCount();
  const stateSlots: StateSlotDef[] = unlinkedIR.builder.getStateSlots().map(s => ({
    initialValue: s.initialValue,
  }));
  const stateMappings = unlinkedIR.builder.getStateMappings();

  // Get event counts for runtime allocation
  const eventSlotCount = unlinkedIR.builder.getEventSlotCount();
  const eventExprCount = unlinkedIR.builder.getEventExprs().length;

  return {
    timeModel,
    instances,
    steps,
    stateSlotCount,
    stateSlots,
    stateMappings,
    eventSlotCount,
    eventExprCount,
  };
}

/**
 * Check if a signal expression transitively depends on an eventRead.
 * Used to schedule event-dependent signals after event evaluation.
 */
function sigDependsOnEvent(sigId: number, signals: readonly SigExpr[]): boolean {
  const visited = new Set<number>();

  function check(id: number): boolean {
    if (visited.has(id)) return false;
    visited.add(id);

    const expr = signals[id];
    if (!expr) return false;

    switch (expr.kind) {
      case 'eventRead':
        return true;
      case 'map':
        return check(expr.input as number);
      case 'zip':
        return expr.inputs.some(input => check(input as number));
      case 'const':
      case 'slot':
      case 'time':
      case 'external':
      case 'stateRead':
      case 'shapeRef':
        return false;
      default:
        return false;
    }
  }

  return check(sigId);
}

/**
 * Convert TimeModelIR to TimeModel for schedule.
 */
function convertTimeModel(timeModelIR: TimeModelIR): TimeModel {
  return { kind: 'infinite' };
}
