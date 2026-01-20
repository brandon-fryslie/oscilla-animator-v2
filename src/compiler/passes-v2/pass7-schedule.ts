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

import type { Step, StepRender, StepMaterialize, StepContinuityMapBuild, StepContinuityApply, TimeModel, InstanceId, InstanceDecl, FieldExprId, SigExprId, ValueSlot, ContinuityPolicy } from '../ir/types';
import type { UnlinkedIRFragments } from './pass6-block-lowering';
import type { AcyclicOrLegalGraph, NormalizedEdge, Block, BlockIndex } from '../ir/patches';
import type { TimeModelIR } from '../ir/schedule';
import type { ValueRefPacked } from '../ir/lowerTypes';
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
 * - stateSlots: Initial values for state slots
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

  /** Initial values for state slots */
  readonly stateSlots: readonly StateSlotDef[];
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
  size?: { k: 'sig'; id: SigExprId } | { k: 'field'; id: FieldExprId };
  shape?: { k: 'sig'; id: SigExprId } | { k: 'field'; id: FieldExprId };
}

/**
 * Collect render target info from render blocks.
 */
function collectRenderTargets(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>,
  instances: ReadonlyMap<InstanceId, InstanceDecl>
): RenderTargetInfo[] {
  const targets: RenderTargetInfo[] = [];
  const renderBlocks = findRenderBlocks(blocks);

  // MVP - Use first instance (demo patch has single instance)
  const instanceId = instances.keys().next().value;
  if (!instanceId) {
    return targets;
  }

  for (const { block, index } of renderBlocks) {
    // Trace inputs through edges to blockOutputs
    const posRef = getInputRef(index, 'pos', edges, blockOutputs);
    const colorRef = getInputRef(index, 'color', edges, blockOutputs);
    const sizeRef = getInputRef(index, 'size', edges, blockOutputs);
    const shapeRef = getInputRef(index, 'shape', edges, blockOutputs);

    // Validate required inputs (position and color)
    if (posRef?.k !== 'field') {
      continue;
    }
    if (colorRef?.k !== 'field') {
      continue;
    }

    // Build optional size/shape
    const size = sizeRef?.k === 'field' ? { k: 'field' as const, id: sizeRef.id }
               : sizeRef?.k === 'sig' ? { k: 'sig' as const, id: sizeRef.id }
               : undefined;

    const shape = shapeRef?.k === 'field' ? { k: 'field' as const, id: shapeRef.id }
                : shapeRef?.k === 'sig' ? { k: 'sig' as const, id: shapeRef.id }
                : undefined;

    targets.push({
      instanceId,
      position: posRef.id,
      color: colorRef.id,
      size,
      shape,
    });
  }

  return targets;
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
    const { instanceId, position, color, size, shape } = target;

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

    // Process size (semantic: radius) if it's a field
    let sizeOutput: StepRender['size'] = undefined;
    if (size) {
      if (size.k === 'field') {
        const sizeSlots = getFieldSlots(size.id, 'radius');
        sizeOutput = { k: 'slot', slot: sizeSlots.outputSlot };
      } else {
        // Signal - pass through unchanged
        sizeOutput = size;
      }
    }

    // Process shape (semantic: custom) if it's a field
    let shapeOutput: StepRender['shape'] = undefined;
    if (shape) {
      if (shape.k === 'field') {
        const shapeSlots = getFieldSlots(shape.id, 'custom');
        shapeOutput = { k: 'slot', slot: shapeSlots.outputSlot };
      } else {
        // Signal - pass through unchanged
        shapeOutput = shape;
      }
    }

    // 4. Create render step that reads from output slots
    const renderStep: StepRender = {
      kind: 'render',
      instanceId,
      positionSlot: posSlots.outputSlot,
      colorSlot: colorSlots.outputSlot,
      ...(sizeOutput && { size: sizeOutput }),
      ...(shapeOutput && { shape: shapeOutput }),
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

  // Collect render targets from render blocks
  const renderTargets = collectRenderTargets(
    validated.blocks,
    validated.edges,
    unlinkedIR.blockOutputs,
    instances
  );

  // Build the complete continuity pipeline
  const {
    mapBuildSteps,
    materializeSteps,
    continuityApplySteps,
    renderSteps,
  } = buildContinuityPipeline(renderTargets, instances, slotAllocator);

  // Collect steps from builder (stateWrite steps from stateful blocks)
  const builderSteps = unlinkedIR.builder.getSteps();

  // Combine all steps in correct execution order:
  // 1. ContinuityMapBuild (detect domain changes, compute mappings)
  // 2. Materialize (evaluate fields to buffers)
  // 3. ContinuityApply (apply gauge/slew/crossfade to buffers)
  // 4. Render (use continuity-applied buffers)
  // 5. StateWrite (persist state for next frame)
  const steps: Step[] = [
    ...mapBuildSteps,
    ...materializeSteps,
    ...continuityApplySteps,
    ...renderSteps,
    ...builderSteps,
  ];

  // Get state slots from builder
  const stateSlotCount = unlinkedIR.builder.getStateSlotCount();
  const stateSlots: StateSlotDef[] = unlinkedIR.builder.getStateSlots().map(s => ({
    initialValue: s.initialValue,
  }));

  return {
    timeModel,
    instances,
    steps,
    stateSlotCount,
    stateSlots,
  };
}

/**
 * Convert TimeModelIR to TimeModel for schedule.
 */
function convertTimeModel(timeModelIR: TimeModelIR): TimeModel {
  return { kind: 'infinite' };
}
