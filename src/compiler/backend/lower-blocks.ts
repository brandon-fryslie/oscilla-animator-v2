/**
 * Pass 6: Block Lowering to IR
 */

import type { AcyclicOrLegalGraph, BlockIndex, DepGraph, SCC } from "../ir/patches";
import type { Block } from "../../types";
import type { VarargConnection } from "../../graph/Patch";
import type { IRBuilder } from "../ir/IRBuilder";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import type { CompileError } from "../types";
import { isExprRef, type ValueRefExpr } from "../ir/lowerTypes";
import type { InstanceId } from "../ir/Indices";
import { getBlockDefinition, type LowerCtx, type LowerResult, hasLowerOutputsOnly } from "../../blocks/registry";
import type { EventHub } from "../../events/EventHub";
import { type CanonicalType, requireInst } from "../../core/canonical-types";
import type { PortKey } from "../frontend/analyze-type-constraints";
// Multi-Input Blocks Integration
import {
  type Writer,
  resolveBlockInputs,
} from "../passes-v2/resolveWriters";
import {
  createCombineNode,
  validateCombinePolicy,
  shouldCombine,
} from "../passes-v2/combine-utils";
import type { NormalizedEdge } from "../ir/patches";

// Helper to create port key
function portKey(blockIndex: BlockIndex, portName: string, direction: 'in' | 'out'): PortKey {
  return `${blockIndex}:${portName}:${direction}` as PortKey;
}

/**
 * Extract a compile-time constant from a block's port defaultSource.
 * Checks the port override first, then falls back to the registry default.
 */
function getPortConstValue(block: Block, portId: string): unknown {
  // Check port-level override
  const port = block.inputPorts.get(portId);
  if (port?.defaultSource?.blockType === 'Const') {
    return port.defaultSource.params?.value;
  }
  // Fall back to registry default
  const def = getBlockDefinition(block.type);
  const inputDef = def?.inputs[portId];
  if (inputDef?.defaultSource?.blockType === 'Const') {
    return inputDef.defaultSource.params?.value;
  }
  return undefined;
}

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
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>;

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
  /** Address registry for blocks that need address resolution (e.g., Expression block) */
  addressRegistry?: import('../../graph/address-registry').AddressRegistry;
}
// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if an SCC is non-trivial (contains an actual cycle).
 *
 * An SCC is non-trivial if:
 * - It has more than one node (multi-block cycle)
 * - It has a self-loop (single block with feedback to itself)
 *
 * @param scc - The strongly connected component
 * @param graph - The dependency graph
 * @returns true if SCC is non-trivial (has a cycle)
 */
function isNonTrivialSCC(scc: SCC, graph: DepGraph): boolean {
  // Multi-block cycle
  if (scc.nodes.length > 1) {
    return true;
  }

  // Single node - check for self-loop
  if (scc.nodes.length === 1) {
    const node = scc.nodes[0];
    // Check if there's an edge from this node to itself
    const hasSelfLoop = graph.edges.some(
      edge => edge.from === node && edge.to === node
    );
    return hasSelfLoop;
  }

  // Empty SCC (shouldn't happen, but handle gracefully)
  return false;
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
 * @returns Map of slotId → ValueRefExpr
 */
function resolveInputsWithMultiInput(
  block: Block,
  edges: readonly NormalizedEdge[],
  blocks: readonly Block[],
  builder: IRBuilder,
  errors: CompileError[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefExpr>>,
  blockIdToIndex?: Map<string, BlockIndex>
): Map<string, ValueRefExpr> {
  const resolved = resolveBlockInputs(block, edges, blocks);
  const inputRefs = new Map<string, ValueRefExpr>();

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
    const writerRefs: ValueRefExpr[] = [];
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

    // portType is InferenceCanonicalType from ResolvedInputSpec, but by this point
    // in the backend pipeline all types are concrete (vars resolved by solver).
    const combinedRef = createCombineNode(
      combine.mode,
      writerRefs,
      portType as CanonicalType,
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
 * Converts Writer (from resolveWriters) to ValueRefExpr by looking up
 * in blockOutputs (IR-lowered blocks).
 *
 * @param writer - Writer specification
 * @param errors - Error accumulator
 * @param blockOutputs - Map of block outputs for wire resolution
 * @param blockIdToIndex - Map from block ID to block index
 * @returns ValueRefExpr or null if writer cannot be resolved
 */
function getWriterValueRef(
  writer: Writer,
  errors: CompileError[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefExpr>>,
  blockIdToIndex?: Map<string, BlockIndex>
): ValueRefExpr | null {
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
 * @param portTypes - Resolved port types from pass1
 * @param existingOutputs - Existing outputs from phase 1 (for two-pass lowering)
 * @returns Map of port ID to ValueRefExpr
 */
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  builder: IRBuilder,
  errors: CompileError[],
  edges?: readonly NormalizedEdge[],
  blocks?: readonly Block[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefExpr>>,
  blockIdToIndex?: Map<string, BlockIndex>,
  instanceContextByBlock?: Map<BlockIndex, InstanceId>,
  portTypes?: ReadonlyMap<PortKey, CanonicalType>,
  existingOutputs?: Partial<LowerResult>,
  addressRegistry?: import('../../graph/address-registry').AddressRegistry
): Map<string, ValueRefExpr> {
  const outputRefs = new Map<string, ValueRefExpr>();
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
    const inputsById: Record<string, ValueRefExpr> = (edges !== undefined && blocks !== undefined)
      ? Object.fromEntries(resolveInputsWithMultiInput(block, edges, blocks, builder, errors, blockOutputs, blockIdToIndex).entries())
      : {};

    const inputs: ValueRefExpr[] = [];
    let hasUnresolvedInputs = false;
    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      // CRITICAL: Skip config-only inputs (exposedAsPort: false)
      // These are not wirable ports and should not require resolution
      if (inputDef.exposedAsPort === false) continue;

      const resolved = inputsById[portId];
      if (resolved !== undefined) {
        inputs.push(resolved);
      } else if (inputDef.optional) {
        // Optional inputs can be undefined - lowering function must handle this
        // Don't add to inputs array, but allow lowering to proceed
      } else {
        // Accumulate error for unresolved required input
        errors.push({
          code: "NotImplemented",
          message: `Unresolved input "${portId}" for block "${block.type}" (${block.id}). All inputs should be resolved by multi-input resolution.`,
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

    // Extract varargConnections from block.inputPorts
    // Build map from port ID to array of VarargConnection
    const varargConnectionsMap = new Map<string, readonly VarargConnection[]>();
    for (const [portId, inputPort] of block.inputPorts.entries()) {
      if (inputPort.varargConnections && inputPort.varargConnections.length > 0) {
        varargConnectionsMap.set(portId, inputPort.varargConnections);
      }
    }

    // Resolve output types from pass1 portTypes, falling back to declared type.
    // The array MUST be positionally complete (one entry per output port in declaration order)
    // so that blocks can index into it by position.
    const outTypes: CanonicalType[] = Object.keys(blockDef.outputs)
      .map(portName => (portTypes?.get(portKey(blockIndex, portName, 'out'))
        ?? blockDef.outputs[portName].type) as CanonicalType);
    // Backend reads portTypes from TypedPatch - never modifies them.
    // Blocks with 'preserve' cardinality must rewrite placeholder instance IDs
    // in their own lower() function using withInstance() (see Array, GridLayoutUV, etc.)

    // Build lowering context
    const ctx: LowerCtx = {
      blockIdx: blockIndex,
      blockType: block.type,
      instanceId: block.id,
      label: block.label,
      // Use resolved types from pass1 (portTypes) - THE source of truth
      inTypes: Object.keys(blockDef.inputs)
        .filter(portName => blockDef.inputs[portName].exposedAsPort !== false)
        .map(portName => portTypes?.get(portKey(blockIndex, portName, 'in')))
        .filter((t): t is CanonicalType => t !== undefined),
      outTypes,
      b: builder,
      seedConstId: 0, // Seed value not used by current intrinsics (randomId uses element index only)
      inferredInstance,
      varargConnections: varargConnectionsMap.size > 0 ? varargConnectionsMap : undefined,
      addressRegistry,
    };

    // Pass block params as config (needed for DSConst blocks to access their value)
    const config = block.params;

    // Call lowering function (with existingOutputs if this is phase 2)
    let result = blockDef.lower({ ctx, inputs, inputsById, config, block, existingOutputs });

    // Auto-propagate instanceContext for blocks with field outputs
    // Only applies if the block didn't explicitly set instanceContext
    if (!('instanceContext' in result)) {
      // Check if any output has many-cardinality (is a field)
      let hasFieldOutput = false;
      if (result.outputsById) {
        for (const ref of Object.values(result.outputsById)) {
          if (isExprRef(ref)) {
            const card = requireInst(ref.type.extent.cardinality, 'cardinality');
            if (card.kind === 'many') {
              hasFieldOutput = true;
              break;
            }
          }
        }
      }

      // If block has field outputs and didn't explicitly set instanceContext,
      // auto-propagate from ctx.inferredInstance
      if (hasFieldOutput && ctx.inferredInstance !== undefined) {
        result = {
          ...result,
          instanceContext: ctx.inferredInstance,
        };
      }
    }

    // All blocks MUST use outputsById pattern
    // Allow empty outputsById only if block has no declared outputs
    const hasOutputs = Object.keys(blockDef.outputs).length > 0;
    if (result.outputsById === undefined || (hasOutputs && Object.keys(result.outputsById).length === 0)) {
      errors.push({
        code: "IRValidationFailed",
        message: `Block ${ctx.blockType}#${ctx.instanceId} must use outputsById pattern (outputs array is deprecated)`,
        where: { blockId: block.id },
      });
      return outputRefs;
    }

    // Map outputs to port IDs using outputsById
    const portOrder = Object.keys(blockDef.outputs);
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

      // Register slot for signal/field/event outputs
      // Check extent directly instead of using deriveKind
      if (isExprRef(ref)) {
        const temp = requireInst(ref.type.extent.temporality, 'temporality');
        const isEvent = temp.kind === 'discrete';

        if (!isEvent) {
          const card = requireInst(ref.type.extent.cardinality, 'cardinality');
          const isField = card.kind === 'many';

          if (isField) {
            // Field — register field slot and slot type
            builder.registerFieldSlot(ref.id, ref.slot);
            builder.registerSlotType(ref.slot, ref.type);
          } else {
            // Signal — register sig slot (if stride=1) and slot type
            if (ref.stride === 1) {
              builder.registerSigSlot(ref.id, ref.slot);
            }
            builder.registerSlotType(ref.slot, ref.type);
          }
        } else {
          // Event — register slot type only
          builder.registerSlotType(ref.slot, ref.type);
        }
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

    // Detect expression errors by checking error message for ExprXxxError codes
    let errorKind = "NotImplemented";
    if (error instanceof Error && block.type === 'Expression') {
      if (error.message.includes('ExprSyntaxError')) {
        errorKind = 'ExprSyntaxError';
      } else if (error.message.includes('ExprTypeError')) {
        errorKind = 'ExprTypeError';
      } else if (error.message.includes('ExprCompileError')) {
        errorKind = 'ExprCompileError';
      }
    }

    errors.push({
      code: errorKind,
      message: errorMsg,
      where: { blockId: block.id },
    });
  }

  return outputRefs;
}

// =============================================================================
// Two-Pass SCC Lowering
// =============================================================================

/**
 * Lower blocks in a non-trivial SCC using two-pass lowering.
 *
 * Pass 1: Generate outputs for stateful blocks (lowerOutputsOnly)
 * - Stateful blocks with lowerOutputsOnly generate outputs without needing inputs
 * - These outputs are stored in blockOutputs, making them available to other blocks
 * - Non-stateful blocks skip this pass
 *
 * Pass 2: Full lowering for all blocks
 * - Stateful blocks call lower() with existingOutputs to generate state writes
 * - Non-stateful blocks call lower() normally (inputs now available)
 *
 * @param scc - The strongly connected component (cycle)
 * @param blocks - All blocks in the patch
 * @param edges - All edges in the patch
 * @param builder - IRBuilder for emitting IR
 * @param errors - Error accumulator
 * @param blockOutputs - Map of block outputs (populated in-place)
 * @param blockIdToIndex - Map from block ID to block index
 * @param instanceContextByBlock - Map from block index to instance context
 * @param portTypes - Resolved port types from pass1
 * @param options - Event emission options
 */
function lowerSCCTwoPass(
  scc: SCC,
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  builder: IRBuilder,
  errors: CompileError[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>,
  blockIdToIndex: Map<string, BlockIndex>,
  instanceContextByBlock: Map<BlockIndex, InstanceId>,
  portTypes: ReadonlyMap<PortKey, CanonicalType>,
  options?: Pass6Options
): void {
  // Storage for phase 1 results
  const phase1Results = new Map<BlockIndex, Partial<LowerResult>>();

  // Pass 1: Generate outputs for stateful blocks with lowerOutputsOnly
  for (const node of scc.nodes) {
    if (node.kind !== "BlockEval") continue;

    const blockIndex = node.blockIndex;
    const block = blocks[blockIndex];
    if (!block) continue;

    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    // Only process stateful blocks with lowerOutputsOnly
    if (blockDef.isStateful && hasLowerOutputsOnly(blockDef)) {
      (builder as any).setCurrentBlockId(block.id);

      try {
        // Build lowering context (similar to lowerBlockInstance but no input resolution)
        const ctx: LowerCtx = {
          blockIdx: blockIndex,
          blockType: block.type,
          instanceId: block.id,
          label: block.label,
          inTypes: Object.keys(blockDef.inputs)
            .filter(portName => blockDef.inputs[portName].exposedAsPort !== false)
            .map(portName => portTypes?.get(portKey(blockIndex, portName, 'in')))
            .filter((t): t is CanonicalType => t !== undefined),
          outTypes: Object.keys(blockDef.outputs)
            .map(portName => (portTypes?.get(portKey(blockIndex, portName, 'out'))
              ?? blockDef.outputs[portName].type) as CanonicalType),
          b: builder,
          seedConstId: 0,
        };

        const config = block.params;

        // Call lowerOutputsOnly
        const partialResult = blockDef.lowerOutputsOnly!({ ctx, config });

        // Store partial result for phase 2
        phase1Results.set(blockIndex, partialResult);

        // Register outputs in blockOutputs (making them available to other blocks)
        if (partialResult.outputsById) {
          const outputRefs = new Map<string, ValueRefExpr>();
          for (const [portId, ref] of Object.entries(partialResult.outputsById)) {
            // Register slot types - check extent directly instead of using deriveKind
            if (isExprRef(ref)) {
              const temp = requireInst(ref.type.extent.temporality, 'temporality');
              const isEvent = temp.kind === 'discrete';

              if (!isEvent) {
                const card = requireInst(ref.type.extent.cardinality, 'cardinality');
                const isField = card.kind === 'many';

                if (isField) {
                  // Field — register field slot and slot type
                  builder.registerFieldSlot(ref.id, ref.slot);
                  builder.registerSlotType(ref.slot, ref.type);
                } else {
                  // Signal — register sig slot (if stride=1) and slot type
                  if (ref.stride === 1) {
                    builder.registerSigSlot(ref.id, ref.slot);
                  }
                  builder.registerSlotType(ref.slot, ref.type);
                }
              } else {
                // Event — register slot type only
                builder.registerSlotType(ref.slot, ref.type);
              }
            }
            outputRefs.set(portId, ref);
          }
          blockOutputs.set(blockIndex, outputRefs);
        }
      } catch (error) {
        errors.push({
          code: "NotImplemented",
          message: `Phase 1 lowering failed for "${block.type}": ${error instanceof Error ? error.message : String(error)}`,
          where: { blockId: block.id },
        });
      }
    }
  }

  // Pass 2: Full lowering for all blocks
  // Strategy: Process blocks in dependency order, treating stateful block outputs
  // as already available (from phase 1).

  // Helper to lower a single block
  const lowerSingleBlock = (blockIndex: BlockIndex) => {
    const block = blocks[blockIndex];
    if (!block) return;

    (builder as any).setCurrentBlockId(block.id);

    // Get existing outputs from phase 1 (if any)
    const existingOutputs = phase1Results.get(blockIndex);

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
      instanceContextByBlock,
      portTypes,
      existingOutputs,
      options?.addressRegistry
    );

    // Update blockOutputs (may overwrite phase 1 results, but should be identical)
    if (outputRefs.size > 0) {
      blockOutputs.set(blockIndex, outputRefs);
    }

    // Emit BlockLowered event
    if (options?.events) {
      const instanceContext = instanceContextByBlock.get(blockIndex);
      const instanceCount = block.type === 'Array'
        ? (getPortConstValue(block, 'count') as number | undefined)
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
  };

  // Build set of block indices in this SCC
  const sccBlockIndices = new Set<BlockIndex>();
  for (const node of scc.nodes) {
    if (node.kind === "BlockEval") {
      sccBlockIndices.add(node.blockIndex);
    }
  }

  // Build set of stateful block indices (their outputs are already available)
  const statefulBlockIndices = new Set<BlockIndex>();
  for (const idx of sccBlockIndices) {
    const block = blocks[idx];
    if (!block) continue;
    const blockDef = getBlockDefinition(block.type);
    if (blockDef?.isStateful && hasLowerOutputsOnly(blockDef)) {
      statefulBlockIndices.add(idx);
    }
  }

  // Topological sort of non-stateful blocks within the SCC
  // Edges within SCC from non-stateful -> non-stateful need ordering
  // Edges from stateful blocks are "free" (outputs already available)
  const nonStatefulIndices = [...sccBlockIndices].filter(idx => !statefulBlockIndices.has(idx));
  const lowered = new Set<BlockIndex>(statefulBlockIndices); // Stateful outputs already available
  const remaining = new Set<BlockIndex>(nonStatefulIndices);

  // Keep lowering blocks whose inputs are satisfied until all done
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const blockIndex of remaining) {
      const block = blocks[blockIndex];
      if (!block) {
        remaining.delete(blockIndex);
        continue;
      }

      // Check if all SCC-internal dependencies are satisfied
      let canLower = true;
      for (const edge of edges) {
        // Is this edge an input to this block?
        if (edge.toBlock !== blockIndex) continue;

        // Is the source in this SCC?
        const sourceIdx = edge.fromBlock;
        if (!sccBlockIndices.has(sourceIdx)) continue; // External dependency, already available

        // Is the source lowered?
        if (!lowered.has(sourceIdx)) {
          canLower = false;
          break;
        }
      }

      if (canLower) {
        lowerSingleBlock(blockIndex);
        lowered.add(blockIndex);
        remaining.delete(blockIndex);
        progress = true;
      }
    }
  }

  // If we couldn't make progress, there's still a dependency issue
  // (shouldn't happen if pass5 validated correctly, but handle gracefully)
  if (remaining.size > 0) {
    for (const blockIndex of remaining) {
      const block = blocks[blockIndex];
      errors.push({
        code: "CycleWithoutStatefulBoundary",
        message: `Block "${block?.type || 'unknown'}" in cycle could not be lowered - dependency issue`,
        where: { blockId: block?.id || 'unknown' },
      });
    }
  }

  // Finally, lower the stateful blocks (their inputs should now be available)
  for (const blockIndex of statefulBlockIndices) {
    lowerSingleBlock(blockIndex);
  }
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
 * - Auto-propagates instanceContext for blocks with field outputs
 *   when not explicitly set by the block
 *
 * Two-Pass Lowering for Feedback Loops:
 * - Non-trivial SCCs (cycles) use two-pass lowering
 * - Stateful blocks with lowerOutputsOnly generate outputs first (phase 1)
 * - All blocks then perform full lowering with inputs available (phase 2)
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
  const blockOutputs = new Map<BlockIndex, Map<string, ValueRefExpr>>();
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
    // Check if this SCC is non-trivial (contains a cycle)
    const isNonTrivial = isNonTrivialSCC(scc, validated.graph);

    if (isNonTrivial) {
      // Use two-pass lowering for cycles
      lowerSCCTwoPass(
        scc,
        blocks,
        edges,
        builder,
        errors,
        blockOutputs,
        blockIdToIndex,
        instanceContextByBlock,
        validated.portTypes,
        options
      );
    } else {
      // Single-pass lowering for trivial SCCs (no cycles)
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
        (builder as any).setCurrentBlockId(block.id);


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
          instanceContextByBlock,
          validated.portTypes,
          undefined, // existingOutputs
          options?.addressRegistry
        );

        if (outputRefs.size > 0) {
          blockOutputs.set(blockIndex, outputRefs);
        }

        // Emit BlockLowered event if EventHub is available
        if (options?.events) {
          const instanceContext = instanceContextByBlock.get(blockIndex);
          // For instance-creating blocks (Array), get the count from params
          const instanceCount = block.type === 'Array'
            ? (getPortConstValue(block, 'count') as number | undefined)
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
  }

  // Clear block ID after processing all blocks
  (builder as any).setCurrentBlockId(undefined);

  return {
    builder,
    blockOutputs,
    errors,
  };
}
