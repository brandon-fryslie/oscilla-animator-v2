/**
 * Pass 7: Schedule Construction
 *
 * Builds execution schedule with explicit phase ordering:
 * 1. Update rails/time inputs
 * 2. Execute continuous scalars (evalSig)
 * 3. Execute continuous fields (materialize)
 * 4. Apply discrete ops (events)
 * 5. Sinks (render)
 * 6. State writes (stateWrite)
 *
 * The schedule respects data dependencies within each phase and provides
 * deterministic execution order.
 */

import type { Step, StepRender, TimeModel, InstanceId, InstanceDecl, FieldExprId, SigExprId } from '../ir/types';
import type { UnlinkedIRFragments } from './pass6-block-lowering';
import type { AcyclicOrLegalGraph, NormalizedEdge, Block, BlockIndex } from '../ir/patches';
import type { TimeModelIR } from '../ir/schedule';
import type { ValueRefPacked } from '../ir/lowerTypes';
import { getBlockDefinition } from '../../blocks/registry';

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
 * Build render steps from render blocks.
 *
 * P0: Generates StepRender for each render block
 * P1: Wires position, color, size inputs from blockOutputs
 * P2: Resolves instance for each render step
 */
function buildRenderSteps(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>,
  instances: ReadonlyMap<InstanceId, InstanceDecl>
): StepRender[] {
  const steps: StepRender[] = [];
  const renderBlocks = findRenderBlocks(blocks);

  // P2: MVP - Use first instance (demo patch has single instance)
  const instanceId = instances.keys().next().value;
  if (!instanceId) {
    return steps;
  }

  for (const { block, index } of renderBlocks) {
    // P1: Trace inputs through edges to blockOutputs
    const posRef = getInputRef(index, 'pos', edges, blockOutputs);
    const colorRef = getInputRef(index, 'color', edges, blockOutputs);
    const sizeRef = getInputRef(index, 'size', edges, blockOutputs);
    const shapeRef = getInputRef(index, 'shape', edges, blockOutputs);

    // P0/P1: Validate required inputs (position and color)
    if (posRef?.k !== 'field') {
      continue;
    }
    if (colorRef?.k !== 'field') {
      continue;
    }

    // Build optional size
    const size = sizeRef?.k === 'field' ? { k: 'field' as const, id: sizeRef.id }
               : sizeRef?.k === 'sig' ? { k: 'sig' as const, id: sizeRef.id }
               : undefined;

    // Build optional shape
    const shape = shapeRef?.k === 'field' ? { k: 'field' as const, id: shapeRef.id }
                : shapeRef?.k === 'sig' ? { k: 'sig' as const, id: shapeRef.id }
                : undefined;

    // P0: Create StepRender with wired inputs
    const step: StepRender = {
      kind: 'render',
      instanceId: instanceId,
      position: posRef.id,
      color: colorRef.id,
      ...(size && { size }),
      ...(shape && { shape }),
    };

    steps.push(step);
  }

  return steps;
}

// =============================================================================
// Pass 7 Entry Point
// =============================================================================

/**
 * Pass 7: Schedule Construction
 *
 * Builds topologically-ordered execution schedule from unlinked IR fragments.
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

  // Build render steps (P0, P1, P2)
  const renderSteps = buildRenderSteps(
    validated.blocks,
    validated.edges,
    unlinkedIR.blockOutputs,
    instances
  );

  // Collect steps from builder (stateWrite steps from stateful blocks)
  const builderSteps = unlinkedIR.builder.getSteps();

  // Combine render steps with builder steps (render first, then state writes)
  const steps: Step[] = [...renderSteps, ...builderSteps];

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
  if (timeModelIR.kind === 'finite') {
    return {
      kind: 'finite',
      durationMs: timeModelIR.durationMs,
    };
  }
  return { kind: 'infinite' };
}
