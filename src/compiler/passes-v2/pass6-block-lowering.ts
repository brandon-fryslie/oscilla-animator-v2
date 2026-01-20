/**
 * Pass 6: Block Lowering to IR
 */

import type { AcyclicOrLegalGraph, BlockIndex } from "../ir/patches";
import type { Block, Edge } from "../../types";
import type { IRBuilder } from "../ir/IRBuilder";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import type { CompileError } from "../types";
import type { ValueRefPacked } from "../ir/lowerTypes";
import type { InstanceId } from "../ir/Indices";
import { getBlockDefinition, type LowerCtx } from "../../blocks/registry";
import { BLOCK_DEFS_BY_TYPE } from "../../blocks/registry";
import type { EventHub } from "../../events/EventHub";
// Multi-Input Blocks Integration
import {
  type Writer,
  resolveBlockInputs,
} from "./resolveWriters";
import {
  createCombineNode,
  validateCombineMode,
  validateCombinePolicy,
  shouldCombine,
} from "./combine-utils";
import type { NormalizedEdge } from "../ir/patches";

// =============================================================================
// Types
// =============================================================================

/**
 * UnlinkedIRFragments - Output of Pass 6
 *
 * Contains IR fragments for each block, but not yet linked together via
 * wires. Block outputs are represented as ValueRefs but inputs
 * are not yet resolved.
 */
export interface UnlinkedIRFragments {
  /** IRBuilder instance containing all emitted nodes */
  builder: IRBuilder;

  /** Map from block index to map of port ID to ValueRef */
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>;

  /** Compilation errors encountered during lowering */
  errors: CompileError[];
}

/**
 * Options for pass6BlockLowering
 */
export interface Pass6Options {
  /** EventHub for emitting BlockLowered events */
  events?: EventHub;
  /** Compile ID for event correlation */
  compileId?: string;
  /** Patch revision for event context */
  patchRevision?: number;
}
// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a domain/payload is valid for combine mode validation.
 * Valid payloads: float, int, vec2, vec3, color, boolean, time, rate, trigger
 */
function isCorePayload(payload: string): boolean {
  const corePayloads = ['float', 'int', 'vec2', 'vec3', 'color', 'boolean', 'time', 'rate', 'trigger'];
  return corePayloads.includes(payload);
}

// =============================================================================
// Multi-Input Resolution
// =============================================================================

/**
 * Resolve input ValueRefs for a block using multi-input resolution.
 *
 * For each input:
 * 1. Enumerate writers via resolveWriters
 * 2. If N=0: Error (should not happen after pass 0 materialization)
 * 3. If N=1: Direct bind
 * 4. If N>1: Validate combine policy, create combine node
 *
 * @param block - Block instance
 * @param edges - Normalized edges (from NormalizedPatch)
 * @param blocks - All blocks in the patch (for index lookup)
 * @param builder - IRBuilder for emitting combine nodes
 * @param errors - Error accumulator
 * @param blockOutputs - Map of block outputs for wire resolution
 * @param blockIdToIndex - Map from block ID to block index
 * @returns Map of slotId → ValueRefPacked
 */
function resolveInputsWithMultiInput(
  block: Block,
  edges: readonly NormalizedEdge[],
  blocks: readonly Block[],
  builder: IRBuilder,
  errors: CompileError[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex?: Map<string, BlockIndex>
): Map<string, ValueRefPacked> {
  const resolved = resolveBlockInputs(block, edges, blocks);
  const inputRefs = new Map<string, ValueRefPacked>();

  for (const [slotId, spec] of resolved.entries()) {
    const { writers, combine, portType, endpoint, optional } = spec;

    // Handle optional inputs with no writers - skip them
    if (writers.length === 0 && optional) {
      // Optional input with no connection - lowering function should handle undefined
      continue;
    }

    // Validate combine policy against writer count
    const policyValidation = validateCombinePolicy(combine, writers.length);
    if (!policyValidation.valid) {
      errors.push({
        code: 'PortTypeMismatch',
        message: policyValidation.reason ?? 'Invalid combine policy',
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    // Convert writers to ValueRefs
    const writerRefs: ValueRefPacked[] = [];
    for (const writer of writers) {
      const writerRef = getWriterValueRef(writer, errors, blockOutputs, blockIdToIndex);
      if (writerRef !== null) {
        writerRefs.push(writerRef);
      }
    }

    // Handle different writer counts
    if (writerRefs.length === 0) {
      // Should not happen - defaults are injected by resolveWriters
      errors.push({
        code: 'UpstreamError',
        message: `No writers for required input ${endpoint.blockId}.${endpoint.slotId}`,
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    if (writerRefs.length === 1 && !shouldCombine(combine, 1)) {
      // Direct bind (optimization: no combine node for single writer)
      inputRefs.set(slotId, writerRefs[0]);
      continue;
    }

    // Multiple writers (or always combine) - create combine node
    if (combine.mode === 'error') {
      // Should have been caught by validateCombinePolicy
      errors.push({
        code: 'PortTypeMismatch',
        message: `Internal error: combine mode 'error' reached combine node creation`,
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    const combinedRef = createCombineNode(
      combine.mode,
      writerRefs,
      portType as any,
      builder
    );

    if (combinedRef === null) {
      errors.push({
        code: 'NotImplemented',
        message: `Failed to create combine node for ${endpoint.blockId}.${endpoint.slotId}`,
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    inputRefs.set(slotId, combinedRef);
  }

  return inputRefs;
}

/**
 * Get ValueRef for a writer.
 *
 * Converts Writer (from resolveWriters) to ValueRefPacked by looking up
 * in blockOutputs (IR-lowered blocks).
 *
 * @param writer - Writer specification
 * @param errors - Error accumulator
 * @param blockOutputs - Map of block outputs for wire resolution
 * @param blockIdToIndex - Map from block ID to block index
 * @returns ValueRefPacked or null if writer cannot be resolved
 */
function getWriterValueRef(
  writer: Writer,
  errors: CompileError[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex?: Map<string, BlockIndex>
): ValueRefPacked | null {
  if (writer.kind === 'wire') {
    // Look in blockOutputs (IR-lowered blocks)
    if (blockOutputs !== undefined && blockIdToIndex !== undefined) {
      const writerBlockIndex = blockIdToIndex.get(writer.from.blockId);
      if (writerBlockIndex !== undefined) {
        const writerOutputs = blockOutputs.get(writerBlockIndex);
        if (writerOutputs !== undefined) {
          const ref = writerOutputs.get(writer.from.slotId);
          if (ref !== undefined) {
            return ref;
          }
        }
      }
    }

    // Wire not found in blockOutputs - this is an error
    errors.push({
      code: 'UpstreamError',
      message: `Wire source not found: ${writer.from.blockId}.${writer.from.slotId}`,
      where: { blockId: writer.from.blockId, port: writer.from.slotId },
    });
    return null;
  }

  // NOTE: writer.kind === 'default' was removed.
  // Default sources are now materialized as DSConst blocks by GraphNormalizer.normalize()
  // before compilation. Those blocks connect via regular wire edges.
  // If we reach here with an unresolved wire, it's a real error.

  return null;
}

// =============================================================================
// Instance Context Propagation
// =============================================================================

/**
 * Infer instance context from input edges.
 *
 * Checks if any input comes from a block that has instance context,
 * and returns that instance context for propagation to the current block.
 *
 * @param blockIndex - Index of block being lowered
 * @param edges - All edges in the patch
 * @param instanceContextByBlock - Map from block index to instance context
 * @returns InstanceId if found, undefined otherwise
 */
function inferInstanceContext(
  blockIndex: BlockIndex,
  edges: readonly NormalizedEdge[],
  instanceContextByBlock: Map<BlockIndex, InstanceId>
): InstanceId | undefined {
  // Find all edges that target this block
  const incomingEdges = edges.filter((e) => e.toBlock === blockIndex);


  // Check each incoming edge's source block for instance context
  for (const edge of incomingEdges) {
    const instanceContext = instanceContextByBlock.get(edge.fromBlock);
    if (instanceContext !== undefined) {
      return instanceContext;
    }
  }

  return undefined;
}

// =============================================================================
// Block Lowering with Registered Functions
// =============================================================================

/**
 * Lower a block instance using its registered lowering function.
 *
 * All blocks MUST have registered IR lowering functions.
 * All blocks MUST use outputsById pattern.
 * No fallback to non-IR lowering.
 *
 * @param block - Block instance
 * @param blockIndex - Block index
 * @param builder - IRBuilder for emitting IR nodes
 * @param errors - Error accumulator
 * @param edges - Normalized edges for multi-input resolution
 * @param blocks - All blocks in the patch (for index lookup)
 * @param blockOutputs - Map of block outputs for wire resolution
 * @param blockIdToIndex - Map from block ID to block index
 * @param instanceContextByBlock - Map from block index to instance context
 * @returns Map of port ID to ValueRefPacked
 */
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  builder: IRBuilder,
  errors: CompileError[],
  edges?: readonly NormalizedEdge[],
  blocks?: readonly Block[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex?: Map<string, BlockIndex>,
  instanceContextByBlock?: Map<BlockIndex, InstanceId>
): Map<string, ValueRefPacked> {
  const outputRefs = new Map<string, ValueRefPacked>();
  const blockDef = getBlockDefinition(block.type);

  if (blockDef === undefined) {
    // No block definition - use UnknownBlockType error kind
    errors.push({
      code: "UnknownBlockType",
      message: `Block type "${block.type}" is not registered`,
      where: { blockId: block.id },
    });

    return outputRefs;
  }

  // Use registered lowering function

  try {
    // Collect input ValueRefs
    // Use resolveInputsWithMultiInput if edges and blocks available
    const inputsById: Record<string, ValueRefPacked> = (edges !== undefined && blocks !== undefined)
      ? Object.fromEntries(resolveInputsWithMultiInput(block, edges, blocks, builder, errors, blockOutputs, blockIdToIndex).entries())
      : {};

    const inputs: ValueRefPacked[] = [];
    let hasUnresolvedInputs = false;
    for (const inputPort of blockDef.inputs) {
      const resolved = inputsById[inputPort.id];
      if (resolved !== undefined) {
        inputs.push(resolved);
      } else if (inputPort.optional) {
        // Optional inputs can be undefined - lowering function must handle this
        // Don't add to inputs array, but allow lowering to proceed
      } else {
        // Accumulate error for unresolved required input
        errors.push({
          code: "NotImplemented",
          message: `Unresolved input "${inputPort.id}" for block "${block.type}" (${block.id}). All inputs should be resolved by multi-input resolution.`,
          where: { blockId: block.id },
        });
        hasUnresolvedInputs = true;
      }
    }

    // Can't call lowering function with incomplete inputs - errors already recorded
    if (hasUnresolvedInputs) {
      return outputRefs;
    }

    // Infer instance context from upstream blocks
    let inferredInstance: InstanceId | undefined;
    if (edges !== undefined && instanceContextByBlock !== undefined) {
      inferredInstance = inferInstanceContext(blockIndex, edges, instanceContextByBlock);
    }

    // Build lowering context
    const ctx: LowerCtx = {
      blockIdx: blockIndex,
      blockType: block.type,
      instanceId: block.id,
      label: block.label,
      inTypes: blockDef.inputs.map((port) => port.type),
      outTypes: blockDef.outputs.map((port) => port.type),
      b: builder,
      seedConstId: 0, // Seed value not used by current intrinsics (randomId uses element index only)
      inferredInstance,
    };

    // Pass block params as config (needed for DSConst blocks to access their value)
    const config = block.params;

    // Call lowering function
    const result = blockDef.lower({ ctx, inputs, inputsById, config });

    // All blocks MUST use outputsById pattern
    // Allow empty outputsById only if block has no declared outputs
    const hasOutputs = blockDef.outputs.length > 0;
    if (result.outputsById === undefined || (hasOutputs && Object.keys(result.outputsById).length === 0)) {
      errors.push({
        code: "IRValidationFailed",
        message: `Block ${ctx.blockType}#${ctx.instanceId} must use outputsById pattern (outputs array is deprecated)`,
        where: { blockId: block.id },
      });
      return outputRefs;
    }

    // Map outputs to port IDs using outputsById
    const portOrder = blockDef.outputs.map((p) => p.id);
    for (const portId of portOrder) {
      const ref = result.outputsById[portId];
      if (ref === undefined) {
        errors.push({
          code: "IRValidationFailed",
          message: `Block ${ctx.blockType}#${ctx.instanceId} outputsById missing port '${portId}'`,
          where: { blockId: block.id },
        });
        continue;
      }

      // Register slot for signal/field outputs (required for pass8 validation)
      if (ref.k === 'sig') {
        builder.registerSigSlot(ref.id, ref.slot);
      } else if (ref.k === 'field') {
        builder.registerFieldSlot(ref.id, ref.slot);
      }

      outputRefs.set(portId, ref);
    }

    // Track instance context for downstream propagation
    if (result.instanceContext !== undefined && instanceContextByBlock !== undefined) {
      instanceContextByBlock.set(blockIndex, result.instanceContext);
    }

  } catch (error) {
    // Lowering failed - record error (will be thrown at end of pass with all other errors)
    const errorMsg = `Block lowering failed for "${block.type}": ${error instanceof Error ? error.message : String(error)}`;

    errors.push({
      code: "NotImplemented",
      message: errorMsg,
      where: { blockId: block.id },
    });
  }

  return outputRefs;
}

// =============================================================================
// Pass 6 Implementation
// =============================================================================

/**
 * Pass 6: Block Lowering
 *
 * Translates blocks into IR nodes using registered lowering functions.
 *
 * All blocks MUST have IR lowering registered via registerBlock().
 * All blocks MUST use outputsById pattern (outputs array deprecated).
 * No fallback to non-IR outputs.
 *
 * Multi-Input Blocks Integration:
 * - Uses resolveInputsWithMultiInput for all input resolution
 * - Supports combine nodes for multi-writer inputs
 *
 * Instance Context Propagation:
 * - Tracks instanceContext returned by blocks (e.g., Array)
 * - Propagates to downstream blocks via ctx.inferredInstance
 *
 * Input: Validated dependency graph + blocks array + edges
 * Output: UnlinkedIRFragments with IR nodes
 */
export function pass6BlockLowering(
  validated: AcyclicOrLegalGraph,
  options?: Pass6Options
): UnlinkedIRFragments {
  const builder = new IRBuilderImpl();

  // Extract blocks and edges from validated patch
  const blocks = validated.blocks;
  const edges = validated.edges;
  const blockOutputs = new Map<BlockIndex, Map<string, ValueRefPacked>>();
  const errors: CompileError[] = [];

  // Track instance context for propagation
  const instanceContextByBlock = new Map<BlockIndex, InstanceId>();

  // Create blockId → blockIndex lookup for input resolution
  const blockIdToIndex = new Map<string, BlockIndex>();
  for (let i = 0; i < blocks.length; i++) {
    blockIdToIndex.set(blocks[i].id, i as BlockIndex);
  }

  // Set time model from Pass 3 (threaded through Pass 4 and 5)
  builder.setTimeModel(validated.timeModel);

  // Process blocks in dependency order
  // Tarjan's SCC algorithm returns SCCs in REVERSE topological order,
  // so we reverse them to process dependencies before dependents
  const orderedSccs = [...validated.sccs].reverse();
  for (const scc of orderedSccs) {
    for (const node of scc.nodes) {
      if (node.kind !== "BlockEval") {
        continue; // Skip non-block nodes
      }

      const blockIndex = node.blockIndex;
      const block = blocks[blockIndex];

      if (block === undefined) {
        errors.push({
          code: "BlockMissing",
          message: `Block index ${blockIndex} out of bounds`,
        });
        continue;
      }

      // Set current block ID for debug index tracking (Phase 7)
      builder.setCurrentBlockId(block.id);


      // Lower this block instance
      const outputRefs = lowerBlockInstance(
        block,
        blockIndex,
        builder,
        errors,
        edges,
        blocks,
        blockOutputs,
        blockIdToIndex,
        instanceContextByBlock
      );

      if (outputRefs.size > 0) {
        blockOutputs.set(blockIndex, outputRefs);
      }

      // Emit BlockLowered event if EventHub is available
      if (options?.events) {
        const instanceContext = instanceContextByBlock.get(blockIndex);
        // For instance-creating blocks (Array), get the count from params
        const instanceCount = block.type === 'Array'
          ? (block.params.count as number | undefined)
          : undefined;

        options.events.emit({
          type: 'BlockLowered',
          compileId: options.compileId || 'unknown',
          patchRevision: options.patchRevision || 0,
          blockId: block.id,
          blockType: block.type,
          instanceId: instanceContext,
          instanceCount,
        });
      }
    }
  }

  // Clear block ID after processing all blocks
  builder.setCurrentBlockId(undefined);

  return {
    builder,
    blockOutputs,
    errors,
  };
}
