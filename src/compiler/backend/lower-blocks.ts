/**
 * Pass 6: Block Lowering to IR
 */

import type { AcyclicOrLegalGraph, BlockIndex, DepGraph, SCC } from "../ir/patches";
import type { BlockId } from "../../types";
import type { CompilerGraphBlock as Block } from "../ir/CompilerGraph";

import type { OrchestratorIRBuilder } from "../ir/OrchestratorIRBuilder";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import type { CompileError } from "../types";
import type { ConstantProvenanceEntry, InstanceCountProvenanceEntry } from "../ir/program";
import { isExprRef, type ValueRefExpr, type CollectInputEntry } from "../ir/lowerTypes";
import type { InstanceId, StateSlotId } from "../ir/Indices";
import type { StableStateId } from "../ir/types";
import {
  getBlockDefinition,
  type LowerCtx,
  type LowerOutputsOnlyResult,
  type LowerResult,
  hasLowerOutputsOnly,
} from "../../blocks/registry";
import type { EventHub } from "../../events/EventHub";
import { payloadStride, type CanonicalType, requireInst, withInstance, isAxisInst } from "../../core/canonical-types";
import { isConcretePayload } from "../../core/inference-types";
import type { PortKey, CollectEdgeKey, InputPortPolicy } from "../ir/patches";
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
// Binding Pass Integration (WI-4)
import { bindEffects, applyBinding, bindOutputs } from "./binding-pass";

// Helper to create port key
function portKey(blockIndex: BlockIndex, portName: string, direction: 'in' | 'out'): PortKey {
  return `${blockIndex}:${portName}:${direction}` as PortKey;
}

function getExistingStateMap(builder: OrchestratorIRBuilder): ReadonlyMap<StableStateId, StateSlotId> {
  // [LAW:one-source-of-truth] Existing state authority is builder stateMappings.
  const stateMap = new Map<StableStateId, StateSlotId>();
  for (const mapping of builder.getStateMappings()) {
    stateMap.set(mapping.stateId, mapping.slotStart as StateSlotId);
  }
  return stateMap;
}

function requireBlockEffects(
  effects: LowerResult['effects'] | undefined,
  block: Block,
  phase: 'phase1' | 'phase2',
): LowerResult['effects'] {
  if (effects) return effects;
  throw new Error(
    `Block ${block.type}#${block.id} ${phase} lowering must return effects (empty arrays allowed, undefined is invalid).`,
  );
}

const EXPRESSION_ERROR_CODES = new Set<CompileError['code']>([
  'ExprSyntaxError',
  'ExprTypeError',
  'ExprCompileError',
]);

function classifyLoweringErrorCode(error: unknown): CompileError['code'] {
  if (typeof error !== 'object' || error === null) return 'NotImplemented';
  if ('code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && EXPRESSION_ERROR_CODES.has(code as CompileError['code'])) {
      return code as CompileError['code'];
    }
  }
  return 'NotImplemented';
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
  builder: OrchestratorIRBuilder;

  /** Map from block index to map of port ID to ValueRef */
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>;

  /** Compilation errors encountered during lowering */
  errors: CompileError[];

  /** Maps user-facing port key ("blockId:portId") → component ValueExprIds for patchable constants */
  constantProvenance: Map<string, ConstantProvenanceEntry>;

  /** Maps user-facing port key ("blockId:portId") → instance whose count is patchable */
  instanceCountProvenance: Map<string, InstanceCountProvenanceEntry>;
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

interface TimeModelState {
  sourceBlockId?: string;
}

function validateSingleTimeSource(
  blocks: readonly Block[],
  errors: CompileError[],
): void {
  const timeBlocks = blocks.filter((block) => {
    const def = getBlockDefinition(block.type);
    return def?.capability === 'time';
  });

  if (timeBlocks.length === 0) {
    errors.push({
      code: 'NoTimeRoot',
      message: 'Patch must have exactly one time source block',
    });
    return;
  }

  if (timeBlocks.length > 1) {
    errors.push({
      code: 'MultipleTimeRoots',
      message: 'Patch cannot have multiple time source blocks',
    });
  }
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
  blockIndex: BlockIndex,
  edges: readonly NormalizedEdge[],
  blocks: readonly Block[],
  builder: OrchestratorIRBuilder,
  errors: CompileError[],
  inputPortPolicies: ReadonlyMap<PortKey, InputPortPolicy>,
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefExpr>>,
  blockIdToIndex?: Map<string, BlockIndex>,
  failedBlocks?: ReadonlySet<BlockIndex>
): MultiInputResolution {
  const resolved = resolveBlockInputs(block, blockIndex, edges, blocks, inputPortPolicies);
  const inputRefs = new Map<string, ValueRefExpr>();
  const upstreamFailedPorts = new Set<string>();

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

    const payload = portType.payload;
    if (isConcretePayload(payload) && isAxisInst(portType.extent.cardinality)) {
      const card = portType.extent.cardinality.value;
      const world = card.kind === 'many' ? 'many' : card.kind === 'one' ? 'one' : 'scalar';
      const modeValidation = validateCombineMode(combine.mode, world, payload.kind);
      if (!modeValidation.valid) {
        errors.push({
          code: 'PortTypeMismatch',
          message: modeValidation.reason ?? 'Invalid combine mode for payload',
          where: { blockId: endpoint.blockId, port: endpoint.slotId },
        });
        continue;
      }
    }

    // Convert writers to ValueRefs, skipping writers from failed upstream blocks
    const writerRefs: ValueRefExpr[] = [];
    let failedWriterCount = 0;
    for (const writer of writers) {
      // Skip writers whose source block already failed — cascade suppression
      if (failedBlocks && blockIdToIndex && isWriterSourceFailed(writer, failedBlocks, blockIdToIndex)) {
        failedWriterCount++;
        continue;
      }
      const writerRef = getWriterValueRef(writer, errors, blockOutputs, blockIdToIndex);
      if (writerRef !== null) {
        writerRefs.push(writerRef);
      }
    }

    // Handle different writer counts
    if (writerRefs.length === 0) {
      if (failedWriterCount > 0 && failedWriterCount === writers.length) {
        // ALL writers came from failed blocks — suppress "No writers" error
        upstreamFailedPorts.add(slotId);
      } else {
        // Genuine missing writer (not caused by upstream failure)
        errors.push({
          code: 'UpstreamError',
          message: `No writers for required input ${endpoint.blockId}.${endpoint.slotId}`,
          where: { blockId: endpoint.blockId, port: endpoint.slotId },
        });
      }
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

  return { inputRefs, upstreamFailedPorts };
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
    // Distinguish "block not lowered at all" vs "block lowered but port missing"
    const sourceBlockIndex = blockIdToIndex?.get(writer.from.blockId);
    const sourceBlockOutputs = sourceBlockIndex !== undefined ? blockOutputs?.get(sourceBlockIndex) : undefined;
    const detail = sourceBlockIndex === undefined
      ? '(source block not in index)'
      : sourceBlockOutputs === undefined
        ? '(source block produced no outputs — check upstream lowering errors)'
        : `(source block has outputs [${[...sourceBlockOutputs.keys()].join(', ')}] but not '${writer.from.slotId}')`;
    errors.push({
      code: 'UpstreamError',
      message: `Wire source not found: ${writer.from.blockId}.${writer.from.slotId} ${detail}`,
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
// Cascade Suppression Helpers
// =============================================================================

/**
 * Result of multi-input resolution with cascade tracking.
 */
interface MultiInputResolution {
  /** Resolved input ValueRefs (same as before) */
  inputRefs: Map<string, ValueRefExpr>;
  /** Ports where ALL writers came from failed upstream blocks */
  upstreamFailedPorts: Set<string>;
}

/**
 * Check if a writer's source block is in the failed set.
 *
 * Pure predicate — no side effects or error accumulation.
 */
function isWriterSourceFailed(
  writer: Writer,
  failedBlocks: ReadonlySet<BlockIndex>,
  blockIdToIndex: ReadonlyMap<string, BlockIndex>
): boolean {
  if (writer.kind !== 'wire') return false;
  const sourceIndex = blockIdToIndex.get(writer.from.blockId);
  return sourceIndex !== undefined && failedBlocks.has(sourceIndex);
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

  // Fallback: look at siblings through shared downstream targets.
  // This handles derived field fallback branches that inherit instance context
  // from sibling inputs on a shared downstream render target.
  // [LAW:one-source-of-truth] Instance ownership still comes from upstream creators;
  // this only discovers that same instance via shared downstream topology.
  const outgoingEdges = edges.filter((e) => e.fromBlock === blockIndex);
  for (const outEdge of outgoingEdges) {
    const targetBlock = outEdge.toBlock;
    const targetContext = instanceContextByBlock.get(targetBlock);
    if (targetContext !== undefined) {
      return targetContext;
    }
    for (const edge of edges) {
      if (edge.toBlock === targetBlock && edge.fromBlock !== blockIndex) {
        const instanceContext = instanceContextByBlock.get(edge.fromBlock);
        if (instanceContext !== undefined) {
          return instanceContext;
        }
      }
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
  builder: OrchestratorIRBuilder,
  errors: CompileError[],
  edges: readonly NormalizedEdge[],
  blocks: readonly Block[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>,
  blockIdToIndex: Map<string, BlockIndex>,
  instanceContextByBlock: Map<BlockIndex, InstanceId>,
  portTypes: ReadonlyMap<PortKey, CanonicalType>,
  inputPortPolicies: ReadonlyMap<PortKey, InputPortPolicy>,
  timeModelState: TimeModelState,
  existingOutputs?: Partial<LowerResult>,
  collectEdgeTypes?: ReadonlyMap<CollectEdgeKey, CanonicalType>,
  failedBlocks?: ReadonlySet<BlockIndex>
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
    const multiInputResult = resolveInputsWithMultiInput(
      block,
      blockIndex,
      edges,
      blocks,
      builder,
      errors,
      inputPortPolicies,
      blockOutputs,
      blockIdToIndex,
      failedBlocks
    );
    const inputsById: Record<string, ValueRefExpr> = Object.fromEntries(multiInputResult.inputRefs.entries());
    const upstreamFailedPorts = multiInputResult.upstreamFailedPorts;

    const inputs: ValueRefExpr[] = [];
    let hasUnresolvedInputs = false;
    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      // CRITICAL: Skip config-only inputs (exposedAsPort: false)
      // These are not wirable ports and should not require resolution
      if (inputDef.exposedAsPort === false) continue;

      // Skip collect ports — resolved separately via collectInputsById
      if (inputDef.collectAccepts) continue;

      const resolved = inputsById[portId];
      if (resolved !== undefined) {
        inputs.push(resolved);
      } else if (upstreamFailedPorts.has(portId)) {
        // Suppress "Unresolved input" — caused by upstream failure, not this block
        hasUnresolvedInputs = true;
      } else {
        // Genuine unresolved input — not caused by upstream failure
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

    // Build collectInputsById for collect ports
    // [LAW:one-type-per-behavior] Collect edges are normal edges resolved per-edge.
    let resolvedCollectInputsById: Record<string, readonly CollectInputEntry[]> | undefined;
    if (edges && blocks && blockOutputs && blockIdToIndex) {
      for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
        if (!inputDef.collectAccepts) continue;

        // Find all edges targeting this collect port, sorted by sortKey
        const collectEdges: NormalizedEdge[] = [];
        for (const edge of edges) {
          if (edge.toBlock === blockIndex && edge.toPort === portId) {
            collectEdges.push(edge);
          }
        }

        if (collectEdges.length === 0) continue;

        // Sort by position in edges array (deterministic)
        // NormalizedEdges are already sorted by (toBlock, toPort, fromBlock, fromPort)

        const entries: CollectInputEntry[] = [];
        for (let edgeIdx = 0; edgeIdx < collectEdges.length; edgeIdx++) {
          const edge = collectEdges[edgeIdx];

          // Look up source block's output value
          const sourceOutputs = blockOutputs.get(edge.fromBlock);
          const sourceRef = sourceOutputs?.get(edge.fromPort);
          if (!sourceRef) continue;

          // Look up per-edge type from collectEdgeTypes
          const edgeKey = `${blockIndex}:${portId}:${edgeIdx}` as CollectEdgeKey;
          const edgeType = collectEdgeTypes?.get(edgeKey) ?? sourceRef.type;
          entries.push({
            value: sourceRef,
            type: edgeType,
            // [LAW:one-source-of-truth] Collect aliases come directly from normalized edge alias.
            alias: edge.alias,
            sortKey: edgeIdx,
          });
        }

        if (entries.length > 0) {
          if (!resolvedCollectInputsById) resolvedCollectInputsById = {};
          resolvedCollectInputsById[portId] = entries;
        }
      }
    }

    // Resolve output types from pass1 portTypes (the solver's source of truth).
    // The array MUST be positionally complete (one entry per output port in declaration order)
    // so that blocks can index into it by position.
    if (!portTypes) {
      throw new Error(
        `portTypes not provided for ${block.type}#${block.id}. ` +
        `This is a compiler bug — all blocks must have solver-resolved port types.`
      );
    }
    let outTypes: CanonicalType[] = Object.keys(blockDef.outputs)
      .map(portName => {
        const resolved = portTypes.get(portKey(blockIndex, portName, 'out'));
        if (!resolved) {
          throw new Error(
            `Cardinality solver did not produce a type for ${block.type}#${block.id}.${portName}:out. ` +
            `This is a compiler bug — the solver must resolve all port types.`
          );
        }
        return resolved;
      });

    // Pre-populate outTypes with instance info from inferredInstance.
    // This eliminates withInstance() ternaries from preserve-cardinality blocks.
    if (inferredInstance !== undefined) {
      const instanceDecl = builder.getInstances().get(inferredInstance);
      if (instanceDecl !== undefined) {
        const inst = { domainTypeId: instanceDecl.domainType, instanceId: inferredInstance };
        outTypes = outTypes.map(t => {
          const card = requireInst(t.extent.cardinality, 'cardinality');
          return card.kind === 'many' ? withInstance(t, inst) : t;
        });
      }
    }

    // Build lowering context
    const ctx: LowerCtx = {
      blockIdx: blockIndex,
      blockType: block.type,
      instanceId: block.id,
      // Use resolved types from pass1 (portTypes) - THE source of truth
      inTypes: Object.keys(blockDef.inputs)
        .filter(portName => blockDef.inputs[portName].exposedAsPort !== false)
        .map(portName => portTypes.get(portKey(blockIndex, portName, 'in')))
        .filter((t): t is CanonicalType => t !== undefined),
      outTypes,
      b: builder,
      seedConstId: 0, // Seed value not used by current intrinsics (randomId uses element index only)
      inferredInstance,
      instances: builder.getInstances(),
    };

    // Pass block params as config (needed for DSConst blocks to access their value)
    const config = block.params ?? {};

      // [LAW:dataflow-not-control-flow] Always run the validation pass;
      // do not branch around it per block type.
      for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
        // Config source-of-truth: config MUST contain config-only keys unless
        // a default exists in the registry definition.
        if (inputDef.exposedAsPort === false && inputDef.defaultValue === undefined && config[portId] === undefined) {
          throw new Error(
            `HARD ERROR: Block ${block.type}#${block.id} missing config key '${portId}'. ` +
            `exposedAsPort is false — value must be in block.params.`
          );
        }
      }

    // Call lowering function (with existingOutputs if this is phase 2)
    let result = blockDef.lower({ ctx, inputs, inputsById, collectInputsById: resolvedCollectInputsById, config, existingOutputs });

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

    // If this block has an instanceContext, rewrite any many-cardinality output types
    // to use the real instance ID (not the placeholder block ID used during type solving).
    //
    // IMPORTANT: This also mutates the underlying ValueExpr node type in the builder,
    // because later passes (e.g. schedule-program.ts) infer instances from ValueExpr.type,
    // not from the ValueRefExpr wrapper returned by blocks.
    if ('instanceContext' in result && result.instanceContext !== undefined) {
      const instanceDecl = builder.getInstances().get(result.instanceContext);
      if (instanceDecl !== undefined && result.outputsById) {
        const instance = { domainTypeId: instanceDecl.domainType, instanceId: result.instanceContext };

        const rewrittenOutputsById: Record<string, ValueRefExpr> = { ...result.outputsById };
        for (const [portId, ref] of Object.entries(result.outputsById)) {
          if (!isExprRef(ref)) continue;
          const card = requireInst(ref.type.extent.cardinality, 'cardinality');
          if (card.kind !== 'many') continue;

          const rewrittenType = withInstance(ref.type, instance);
          const expr = builder.getValueExpr(ref.id);
          if (expr) {
            (expr as { type: CanonicalType }).type = rewrittenType;
          }

          rewrittenOutputsById[portId] = {
            ...ref,
            type: rewrittenType,
            stride: payloadStride(rewrittenType.payload),
          };
        }

        const rewrittenSlotRequests = result.effects.slotRequests?.map((req) => {
          const reqCard = requireInst(req.type.extent.cardinality, 'cardinality');
          if (reqCard.kind !== 'many') return req;
          return { ...req, type: withInstance(req.type, instance) };
        });

        result = {
          ...result,
          outputsById: rewrittenOutputsById,
          effects: rewrittenSlotRequests
            ? { ...result.effects, slotRequests: rewrittenSlotRequests }
            : result.effects,
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

    // Process effects using binding pass (WI-4)
    const blockEffects = requireBlockEffects(result.effects, block, 'phase2');
    if (blockEffects.timeModel) {
      if (timeModelState?.sourceBlockId === undefined || timeModelState.sourceBlockId === block.id) {
        builder.setTimeModel(blockEffects.timeModel);
        if (timeModelState) timeModelState.sourceBlockId = block.id;
      } else {
        errors.push({
          code: 'MultipleTimeRoots',
          message: `Patch cannot have multiple time source blocks (found ${timeModelState.sourceBlockId} and ${block.id})`,
          where: { blockId: block.id },
        });
      }
    }
    const bindingInputs = {
      effects: blockEffects,
      existingState: getExistingStateMap(builder),
      origin: { blockId: block.id },
    };
    const binding = bindEffects(bindingInputs, builder);

    // Check for binding diagnostics
    if (binding.diagnostics.length > 0) {
      for (const diag of binding.diagnostics) {
        errors.push({
          code: diag.level === 'error' ? 'IRValidationFailed' : 'NotImplemented',
          message: diag.message,
          where: { blockId: block.id },
        });
      }
    }

    // Apply binding (mechanical execution)
    applyBinding(builder, binding, blockEffects);

    // Bind outputs using the new helper
    const boundOutputsMap = bindOutputs(
      result.outputsById,
      binding.slotMap,
      block.id,
    );

    // Use bound outputs instead of raw outputs
    result = {
      ...result,
      outputsById: Object.fromEntries(boundOutputsMap.entries()),
    };

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


      // Handle missing slot metadata uniformly for all blocks.
      let finalRef = ref;
      if (isExprRef(ref) && ref.slot === undefined) {
        errors.push({
          code: "IRValidationFailed",
          message: `Block ${ctx.blockType}#${ctx.instanceId} output '${portId}' missing slot (must provide effect slotRequest or explicit slot)`,
          where: { blockId: block.id },
        });
        continue;
      }

      // Register slot for one/many/event outputs
      // Check extent directly instead of using deriveKind
      if (isExprRef(finalRef)) {
        const temp = requireInst(finalRef.type.extent.temporality, 'temporality');
        const isEvent = temp.kind === 'discrete';

        if (!isEvent) {
          const card = requireInst(finalRef.type.extent.cardinality, 'cardinality');
          const isField = card.kind === 'many';

          if (isField) {
            // Field — register field slot and slot type
            builder.registerFieldSlot(finalRef.id, finalRef.slot!);
            builder.registerSlotType(finalRef.slot!, finalRef.type);
          } else {
            // [LAW:one-source-of-truth] All cardinality-one outputs must be scalar-slot addressable.
            builder.registerScalarSlot(finalRef.id, finalRef.slot!);
            builder.registerSlotType(finalRef.slot!, finalRef.type);
          }
        } else {
          // Event — register slot type only
          builder.registerSlotType(finalRef.slot!, finalRef.type);
        }
      }
      outputRefs.set(portId, finalRef);
    }

    // Track instance context for downstream propagation
    if (result.instanceContext !== undefined && instanceContextByBlock !== undefined) {
      instanceContextByBlock.set(blockIndex, result.instanceContext);
    }

  } catch (error) {
    // Lowering failed - record error (will be thrown at end of pass with all other errors)
    const errorMsg = `Block lowering failed for "${block.type}": ${error instanceof Error ? error.message : String(error)}`;

    errors.push({
      // [LAW:one-type-per-behavior] Lowering error classification is block-agnostic.
      code: classifyLoweringErrorCode(error),
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
  builder: OrchestratorIRBuilder,
  errors: CompileError[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>,
  blockIdToIndex: Map<string, BlockIndex>,
  instanceContextByBlock: Map<BlockIndex, InstanceId>,
  portTypes: ReadonlyMap<PortKey, CanonicalType>,
  inputPortPolicies: ReadonlyMap<PortKey, InputPortPolicy>,
  timeModelState: TimeModelState,
  options?: Pass6Options,
  collectEdgeTypes?: ReadonlyMap<CollectEdgeKey, CanonicalType>,
  failedBlocks?: Set<BlockIndex>
): void {
  // Storage for phase 1 results
  // Phase 1 returns symbolic outputs + effects; binding happens before registration
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
      builder.setCurrentBlock(block.id as BlockId);

      try {
        // Build lowering context (similar to lowerBlockInstance but no input resolution)
        const ctx: LowerCtx = {
          blockIdx: blockIndex,
          blockType: block.type,
          instanceId: block.id,
          inTypes: Object.keys(blockDef.inputs)
            .filter(portName => blockDef.inputs[portName].exposedAsPort !== false)
            .map(portName => portTypes.get(portKey(blockIndex, portName, 'in')))
            .filter((t): t is CanonicalType => t !== undefined),
          outTypes: Object.keys(blockDef.outputs)
            .map(portName => {
              const resolved = portTypes.get(portKey(blockIndex, portName, 'out'));
              if (!resolved) {
                throw new Error(
                  `Cardinality solver did not produce a type for ${block.type}#${block.id}.${portName}:out. ` +
                  `This is a compiler bug — the solver must resolve all port types.`
                );
              }
              return resolved;
            }),
          b: builder,
          seedConstId: 0,
          instances: builder.getInstances(),
        };

        const config = block.params;

        // Call lowerOutputsOnly
        const partialResult: LowerOutputsOnlyResult = blockDef.lowerOutputsOnly!({ ctx, config });
        // Store partial result for phase 2
        phase1Results.set(blockIndex, partialResult);

        // BINDING PASS for phase 1: process effects using new binding pass (WI-4)
        const phase1Effects = requireBlockEffects(partialResult.effects, block, 'phase1');
        const bindingInputs = {
          effects: phase1Effects,
          existingState: getExistingStateMap(builder),
          origin: { blockId: block.id, phase: 'phase1' as const },
        };
        const binding = bindEffects(bindingInputs, builder);

        // Check for binding diagnostics
        if (binding.diagnostics.length > 0) {
          for (const diag of binding.diagnostics) {
            errors.push({
              code: diag.level === 'error' ? 'IRValidationFailed' : 'NotImplemented',
              message: diag.message,
              where: { blockId: block.id },
            });
          }
        }

        // Apply binding (mechanical execution)
        applyBinding(builder, binding, phase1Effects);

        // Bind outputs using the new helper
        const boundOutputsMap = bindOutputs(
          partialResult.outputsById,
          binding.slotMap,
          block.id,
        );

        // Register slot types - same logic as in lowerBlockInstance
        for (const [, finalRef] of boundOutputsMap.entries()) {
          if (isExprRef(finalRef)) {
            const temp = requireInst(finalRef.type.extent.temporality, 'temporality');
            const isEvent = temp.kind === 'discrete';

            if (!isEvent) {
              const card = requireInst(finalRef.type.extent.cardinality, 'cardinality');
              const isField = card.kind === 'many';

              if (isField) {
                // Field — register field slot and slot type
                builder.registerFieldSlot(finalRef.id, finalRef.slot!);
                builder.registerSlotType(finalRef.slot!, finalRef.type);
              } else {
                // [LAW:one-source-of-truth] All cardinality-one outputs must be scalar-slot addressable.
                builder.registerScalarSlot(finalRef.id, finalRef.slot!);
                builder.registerSlotType(finalRef.slot!, finalRef.type);
              }
            } else {
              // Event — register slot type only
              builder.registerSlotType(finalRef.slot!, finalRef.type);
            }
          }
        }

        // Update blockOutputs and phase1Results with bound outputs
        blockOutputs.set(blockIndex, boundOutputsMap);
        const boundResult: Partial<LowerResult> = {
          ...partialResult,
          outputsById: Object.fromEntries(boundOutputsMap.entries())
        };
        phase1Results.set(blockIndex, boundResult);
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

    builder.setCurrentBlock(block.id as BlockId);

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
      inputPortPolicies,
      timeModelState,
      existingOutputs,
      collectEdgeTypes,
      failedBlocks
    );

    // Update blockOutputs (may overwrite phase 1 results, but should be identical)
    if (outputRefs.size > 0) {
      blockOutputs.set(blockIndex, outputRefs);
    } else {
      // Block produced no outputs — if it has declared outputs, mark as failed
      const blockDef = getBlockDefinition(block.type);
      if (blockDef && Object.keys(blockDef.outputs).length > 0 && failedBlocks) {
        failedBlocks.add(blockIndex);
      }
    }

    // Emit BlockLowered event
    if (options?.events) {
      const instanceContext = instanceContextByBlock.get(blockIndex);
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

        // Is the source lowered or failed? (failed blocks won't produce outputs,
        // but their failure is recorded — don't stall progress for downstream)
        if (!lowered.has(sourceIdx) && !(failedBlocks?.has(sourceIdx))) {
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
// Post-Lowering Provenance Maps (Source-Agnostic)
// =============================================================================

/**
 * Build constant and instance-count provenance maps by scanning edges post-lowering.
 *
 * Source-agnostic: works with any lowered edge topology.
 * Multi-edge guard: ports with >1 incoming edge are not patchable (combine semantics).
 *
 * For constant provenance:
 * - Single-source edges whose source output is a `const` or `construct` ValueExpr
 *   are recorded keyed by "targetBlockId:targetPortId".
 * - Ports on cardinality-transform blocks that have `semantic: 'instanceCount'`
 *   are excluded from constant provenance (they go into instanceCountProvenance instead).
 *
 * For instance count provenance:
 * - Single-source edges targeting a port with `semantic: 'instanceCount'` on a block
 *   that created an instance → record `{ instanceId }`.
 */
function buildProvenanceMaps(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>,
  instanceContextByBlock: Map<BlockIndex, InstanceId>,
  builder: OrchestratorIRBuilder,
): {
  constantProvenance: Map<string, ConstantProvenanceEntry>;
  instanceCountProvenance: Map<string, InstanceCountProvenanceEntry>;
} {
  const constantProvenance = new Map<string, ConstantProvenanceEntry>();
  const instanceCountProvenance = new Map<string, InstanceCountProvenanceEntry>();

  // Count incoming edges per target port to detect multi-edge (combine) targets
  const edgeCountByTarget = new Map<string, number>();
  for (const edge of edges) {
    const targetKey = `${edge.toBlock}:${edge.toPort}`;
    edgeCountByTarget.set(targetKey, (edgeCountByTarget.get(targetKey) ?? 0) + 1);
  }

  for (const edge of edges) {
    const targetKey = `${edge.toBlock}:${edge.toPort}`;

    // Multi-edge guard: skip ports with >1 incoming edge (combine semantics)
    if ((edgeCountByTarget.get(targetKey) ?? 0) > 1) continue;

    const targetBlock = blocks[edge.toBlock];
    if (!targetBlock) continue;

    const targetDef = getBlockDefinition(targetBlock.type);
    if (!targetDef) continue;

    const targetInputDef = targetDef.inputs[edge.toPort];
    if (!targetInputDef) continue;

    const portKey = `${targetBlock.id}:${edge.toPort}`;

    // Look up source block's output ref
    const sourceOutputs = blockOutputs.get(edge.fromBlock);
    const sourceRef = sourceOutputs?.get(edge.fromPort);
    if (!sourceRef) continue;

    // Instance count provenance: port has semantic: 'instanceCount' and target block created an instance
    if (targetInputDef.semantic === 'instanceCount') {
      const instanceId = instanceContextByBlock.get(edge.toBlock);
      if (instanceId !== undefined) {
        instanceCountProvenance.set(portKey, { instanceId });
      }
      // instanceCount ports are not added to constantProvenance
      continue;
    }

    // Constant provenance: source output is const or construct
    const topExpr = builder.getValueExpr(sourceRef.id);
    if (!topExpr) continue;

    if (topExpr.kind === 'construct') {
      constantProvenance.set(portKey, {
        componentExprIds: [...topExpr.components],
        payloadKind: topExpr.type.payload.kind,
      });
    } else if (topExpr.kind === 'const') {
      constantProvenance.set(portKey, {
        componentExprIds: [sourceRef.id],
        payloadKind: topExpr.type.payload.kind,
      });
    }
  }

  return { constantProvenance, instanceCountProvenance };
}

/**
 * Repair unresolved many-cardinality output types that still reference placeholder
 * block IDs (e.g., Broadcast lowered before an instance context was available).
 *
 * This runs after all blocks have been lowered so instance contexts from sibling
 * branches are available, and rewrites output refs + expr types + slot metadata
 * to the resolved runtime instance.
 */
function repairUnresolvedOutputInstances(
  builder: OrchestratorIRBuilder,
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>,
  instanceContextByBlock: Map<BlockIndex, InstanceId>,
): void {
  const instances = builder.getInstances();
  const slotLayoutInputs = builder.getSlotLayoutInputs() as unknown as Map<number, { readonly type: CanonicalType; readonly stride: number }>;

  // [LAW:dataflow-not-control-flow] Repair executes to fixpoint; convergence is data.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [blockIndex, outputs] of blockOutputs) {
      let hasUndeclaredMany = false;
      for (const ref of outputs.values()) {
        const card = requireInst(ref.type.extent.cardinality, 'cardinality');
        if (card.kind === 'many' && !instances.has(card.instance.instanceId)) {
          hasUndeclaredMany = true;
          break;
        }
      }
      if (!hasUndeclaredMany) continue;

      const inferred = inferInstanceContext(blockIndex, edges, instanceContextByBlock);
      if (!inferred) continue;
      const decl = instances.get(inferred);
      if (!decl) continue;

      const resolvedInstance = { domainTypeId: decl.domainType, instanceId: inferred };
      instanceContextByBlock.set(blockIndex, inferred);

      for (const [portId, ref] of outputs) {
        const card = requireInst(ref.type.extent.cardinality, 'cardinality');
        if (card.kind !== 'many' || instances.has(card.instance.instanceId)) continue;

        const rewrittenType = withInstance(ref.type, resolvedInstance);
        const rewrittenRef: ValueRefExpr = {
          ...ref,
          type: rewrittenType,
          stride: payloadStride(rewrittenType.payload),
        };
        outputs.set(portId, rewrittenRef);

        const expr = builder.getValueExpr(ref.id);
        if (expr) {
          (expr as { type: CanonicalType }).type = rewrittenType;
        }

        if (ref.slot !== undefined) {
          const slotInfo = slotLayoutInputs.get(ref.slot as number);
          if (slotInfo) {
            slotLayoutInputs.set(ref.slot as number, {
              ...slotInfo,
              type: rewrittenType,
              stride: payloadStride(rewrittenType.payload),
            });
          }
        }

        changed = true;
      }
    }
  }
}

/**
 * Emit compile diagnostics for any many-cardinality outputs that still reference
 * unknown instances after repair.
 */
function reportUnresolvedOutputInstances(
  blocks: readonly Block[],
  builder: OrchestratorIRBuilder,
  blockOutputs: Map<BlockIndex, Map<string, ValueRefExpr>>,
  errors: CompileError[],
): void {
  const instances = builder.getInstances();
  for (const [blockIndex, outputs] of blockOutputs) {
    const block = blocks[blockIndex as number];
    if (!block) continue;
    for (const [portId, ref] of outputs) {
      if (!isExprRef(ref)) continue;
      const card = requireInst(ref.type.extent.cardinality, 'cardinality');
      if (card.kind !== 'many') continue;
      const inst = card.instance.instanceId;
      if (instances.has(inst)) continue;

      errors.push({
        code: 'InstanceMismatch',
        message: `Compiler invariant violation: unresolved placeholder instance on ${block.type}#${block.id}.${portId}: ${card.instance.domainTypeId}:${inst}.`,
        where: { blockId: block.id, port: portId },
        details: {
          compilerInvariant: 'unresolvedPlaceholderInstance',
          unresolvedDomainTypeId: card.instance.domainTypeId,
          unresolvedInstanceId: inst,
        },
      });
    }
  }
}

/**
 * Emit compile diagnostics for any lowered slot metadata that still references
 * unknown instances after output repair.
 */
function reportUnresolvedSlotInstances(
  builder: OrchestratorIRBuilder,
  errors: CompileError[],
): void {
  const instances = builder.getInstances();
  const slotLayoutInputs = builder.getSlotLayoutInputs();
  for (const [slot, meta] of slotLayoutInputs) {
    const card = requireInst(meta.type.extent.cardinality, 'cardinality');
    if (card.kind !== 'many') continue;
    const inst = card.instance.instanceId;
    if (instances.has(inst)) continue;

    errors.push({
      code: 'InstanceMismatch',
      message: `Compiler invariant violation: unresolved placeholder instance in slot ${slot}: ${card.instance.domainTypeId}:${inst}.`,
      details: {
        // [LAW:single-enforcer] Pass 6 is the single boundary for unresolved placeholder-instance enforcement.
        compilerInvariant: 'unresolvedPlaceholderInstance',
        slot,
        unresolvedDomainTypeId: card.instance.domainTypeId,
        unresolvedInstanceId: inst,
      },
    });
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
  const timeModelState: TimeModelState = {};

  // Track blocks that failed to lower — downstream blocks skip cascade errors
  const failedBlocks = new Set<BlockIndex>();

  // Track instance context for propagation
  const instanceContextByBlock = new Map<BlockIndex, InstanceId>();

  // Create blockId → blockIndex lookup for input resolution
  const blockIdToIndex = new Map<string, BlockIndex>();
  for (let i = 0; i < blocks.length; i++) {
    blockIdToIndex.set(blocks[i].id, i as BlockIndex);
  }

  validateSingleTimeSource(blocks, errors);
  if (errors.length > 0) {
    return {
      builder,
      blockOutputs,
      errors,
      constantProvenance: new Map<string, ConstantProvenanceEntry>(),
      instanceCountProvenance: new Map<string, InstanceCountProvenanceEntry>(),
    };
  }

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
        validated.inputPortPolicies,
        timeModelState,
        options,
        validated.collectEdgeTypes,
        failedBlocks
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

        // Set current block ID for debug index tracking
        builder.setCurrentBlock(block.id as BlockId);


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
          validated.inputPortPolicies,
          timeModelState,
          undefined, // existingOutputs
          validated.collectEdgeTypes,
          failedBlocks
        );

        if (outputRefs.size > 0) {
          blockOutputs.set(blockIndex, outputRefs);
        } else {
          // Block produced no outputs — if it has declared outputs, mark as failed
          const blockDef = getBlockDefinition(block.type);
          if (blockDef && Object.keys(blockDef.outputs).length > 0) {
            failedBlocks.add(blockIndex);
          }
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
  }

  // Clear block ID after processing all blocks
  builder.clearCurrentBlock();

  // [LAW:one-source-of-truth] Runtime instance IDs are declared by createInstance();
  // any placeholder IDs on lowered outputs are repaired once the full graph context is known.
  repairUnresolvedOutputInstances(
    builder,
    edges,
    blockOutputs,
    instanceContextByBlock,
  );
  // [LAW:single-enforcer] Pass 6 emits unresolved instance diagnostics before backend slot derivation.
  reportUnresolvedOutputInstances(blocks, builder, blockOutputs, errors);
  reportUnresolvedSlotInstances(builder, errors);
  if (!timeModelState.sourceBlockId) {
    errors.push({
      code: 'NoTimeRoot',
      message: 'Patch must have exactly one time source block',
    });
  }

  // Build provenance maps post-lowering (source-agnostic, scans edges)
  const { constantProvenance, instanceCountProvenance } = buildProvenanceMaps(
    blocks,
    edges,
    blockOutputs,
    instanceContextByBlock,
    builder,
  );

  return {
    builder,
    blockOutputs,
    errors,
    constantProvenance,
    instanceCountProvenance,
  };
}
