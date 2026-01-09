/**
 * Pass 6: Block Lowering to IR
 */

import type { AcyclicOrLegalGraph, BlockIndex } from "../ir/patches";
import type { Block, Edge, SlotWorld } from "../../types";
import type { IRBuilder } from "../ir/IRBuilder";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import type { CompileError } from "../types";
import type { ValueRefPacked, LowerCtx } from "../ir/lowerTypes";
import { getBlockType } from "../ir/lowerTypes";
// Multi-Input Blocks Integration
import {
  type Writer,
} from "./resolveWriters";
import {
  createCombineNode,
  validateCombineMode,
  validateCombinePolicy,
  shouldCombine,
} from "./combine-utils";

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
// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a domain is a CoreDomain from core/types.
 * CoreDomains: float, int, vec2, vec3, color, boolean, time, rate, trigger
 */
function isCoreDomain(domain: string): domain is import("../../../core/types").CoreDomain {
  const coreDomains = ['float', 'int', 'vec2', 'vec3', 'color', 'boolean', 'time', 'rate', 'trigger'];
  return coreDomains.includes(domain);
}

// =============================================================================
// Multi-Input Resolution (New in Multi-Input Blocks Integration)
// =============================================================================

/**
 * Resolve input ValueRefs for a block using multi-input resolution.
 *
 * For each input:
 * 1. Enumerate writers (wires, bus listeners, defaults) via resolveWriters
 * 2. If N=0: Error (should not happen after pass 0 materialization)
 * 3. If N=1: Direct bind
 * 4. If N>1: Validate combine policy, create combine node
 *
 * @param block - Block instance
 * @param edges - Unified edges (from Pass 1)
 * @param builder - IRBuilder for emitting combine nodes
 * @param errors - Error accumulator
 * @param blockOutputs - Map of block outputs for wire resolution
 * @param blockIdToIndex - Map from block ID to block index
 * @returns Map of slotId → ValueRefPacked
 */
function resolveInputsWithMultiInput(
  block: Block,
  edges: readonly Edge[],
  builder: IRBuilder,
  errors: CompileError[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex?: Map<string, BlockIndex>
): Map<string, ValueRefPacked> {
  const resolved = resolveBlockInputs(block, edges);
  const inputRefs = new Map<string, ValueRefPacked>();

  for (const [slotId, spec] of resolved.entries()) {
    const { writers, combine, portType, endpoint } = spec;

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

    // Validate combine mode against port type
    // Only validate for slot worlds (signal, field, scalar, config) and core domains
    // Skip validation for event world and internal domains
    if (combine.mode !== 'error' && portType.world !== 'event' && isCoreDomain(portType.domain)) {
      const modeValidation = validateCombineMode(
        combine.mode,
        portType.world as SlotWorld,
        portType.domain as import("../../../core/types").CoreDomain
      );
      if (!modeValidation.valid) {
        errors.push({
          code: 'PortTypeMismatch',
          message: `${modeValidation.reason} for port ${endpoint.blockId}.${endpoint.slotId}`,
          where: { blockId: endpoint.blockId, port: endpoint.slotId },
        });
        continue;
      }
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
 * @param edges - Unified edges for multi-input resolution
 * @param blockOutputs - Map of block outputs for wire resolution
 * @param blockIdToIndex - Map from block ID to block index
 * @returns Map of port ID to ValueRefPacked
 */
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  builder: IRBuilder,
  errors: CompileError[],
  edges?: readonly Edge[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex?: Map<string, BlockIndex>
): Map<string, ValueRefPacked> {
  const outputRefs = new Map<string, ValueRefPacked>();
  const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);

  // Check if block has registered lowering function
  const blockType = getBlockType(block.type);

  if (blockType === undefined) {
    // No lowering function registered
    errors.push({
      code: "NotImplemented",
      message: `Block type "${block.type}" has no registered IR lowering function`,
      where: { blockId: block.id },
    });

    return outputRefs;
  }

  // Use registered lowering function
  console.debug(`[IR] Using IR lowering for ${block.type} (${block.id})`);

  try {
    const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';
    if (enforcePortContract && blockDef !== undefined) {
      const defInputIds = blockDef.inputs.map((input) => input.id);
      const irInputIds = blockType.inputs.map((input) => input.portId);
      const defOutputIds = blockDef.outputs.map((output) => output.id);
      const irOutputIds = blockType.outputs.map((output) => output.portId);

      const inputOrderMismatch = defInputIds.join('|') !== irInputIds.join('|');
      const outputOrderMismatch = defOutputIds.join('|') !== irOutputIds.join('|');

      if (inputOrderMismatch || outputOrderMismatch) {
        errors.push({
          code: "IRValidationFailed",
          message:
            `IR port contract mismatch for "${block.type}" (${block.id}). ` +
            `Editor inputs [${defInputIds.join(", ")}], IR inputs [${irInputIds.join(", ")}]; ` +
            `Editor outputs [${defOutputIds.join(", ")}], IR outputs [${irOutputIds.join(", ")}].`,
          where: { blockId: block.id },
        });
        return outputRefs;
      }
    }

    // Collect input ValueRefs
    // Use resolveInputsWithMultiInput if edges available
    const inputsById: Record<string, ValueRefPacked> = edges !== undefined
      ? Object.fromEntries(resolveInputsWithMultiInput(block, edges, builder, errors, blockOutputs, blockIdToIndex).entries())
      : {};

    const inputs: ValueRefPacked[] = [];
    let hasUnresolvedInputs = false;
    for (const inputPort of (blockDef?.inputs ?? [])) {
      const resolved = inputsById[inputPort.id];
      if (resolved !== undefined) {
        inputs.push(resolved);
      } else {
        // Accumulate error for unresolved input
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

    // Build lowering context
    const ctx: LowerCtx = {
      blockIdx: blockIndex,
      blockType: block.type,
      instanceId: block.id,
      label: block.label,
      inTypes: blockType.inputs.map((port) => port.type),
      outTypes: blockType.outputs.map((port) => port.type),
      b: builder,
      seedConstId: 0, // TODO: Proper seed management
    };

    // Pass block params as config (needed for DSConst blocks to access their value)
    const config = block.params;

    // Call lowering function
    const result = blockType.lower({ ctx, inputs, inputsById, config });

    // All blocks MUST use outputsById pattern
    if (result.outputsById === undefined || Object.keys(result.outputsById).length === 0) {
      errors.push({
        code: "IRValidationFailed",
        message: `Block ${ctx.blockType}#${ctx.instanceId} must use outputsById pattern (outputs array is deprecated)`,
        where: { blockId: block.id },
      });
      return outputRefs;
    }

    // Map outputs to port IDs using outputsById
    const portOrder = blockType.outputs.map((p) => p.portId);
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
 * All blocks MUST have IR lowering registered via registerBlockType().
 * All blocks MUST use outputsById pattern (outputs array deprecated).
 * No fallback to non-IR outputs.
 *
 * Multi-Input Blocks Integration:
 * - Uses resolveInputsWithMultiInput for all input resolution
 * - Supports combine nodes for multi-writer inputs
 *
 * Input: Validated dependency graph + blocks array + edges
 * Output: UnlinkedIRFragments with IR nodes
 */
export function pass6BlockLowering(
  validated: AcyclicOrLegalGraph,
  blocks: readonly Block[],
  edges?: readonly Edge[]
): UnlinkedIRFragments {
  const builder = new IRBuilderImpl();
  const blockOutputs = new Map<BlockIndex, Map<string, ValueRefPacked>>();
  const errors: CompileError[] = [];

  // Create blockId → blockIndex lookup for input resolution
  const blockIdToIndex = new Map<string, BlockIndex>();
  for (let i = 0; i < blocks.length; i++) {
    blockIdToIndex.set(blocks[i].id, i as BlockIndex);
  }

  // Set time model from Pass 3 (threaded through Pass 4 and 5)
  builder.setTimeModel(validated.timeModel);

  // Process blocks in dependency order (already sorted by Pass 4)
  // For each block, translate its output artifacts to IR nodes
  for (const scc of validated.sccs) {
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
        blockOutputs,
        blockIdToIndex
      );

      if (outputRefs.size > 0) {
        blockOutputs.set(blockIndex, outputRefs);
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
