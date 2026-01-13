/**
 * Graph Normalization
 *
 * Transforms a Patch into a NormalizedPatch with:
 * 1. Default source materialization (unconnected inputs with defaultSource get derived blocks)
 * 2. Type-aware adapter insertion (e.g., signal→field broadcast)
 * 3. Dense block indices for efficient iteration
 * 4. Canonical edge ordering
 * 5. Validated structure
 *
 * The compiler does NO type coercion - all adapters are inserted here.
 */

import type { BlockId, PortId, BlockRole, DefaultSource } from '../types';
import type { SignalType } from '../core/canonical-types';
import type { Block, Edge, Patch, Endpoint } from './Patch';
import { getBlockDefinition, type InputDef } from '../blocks/registry';
import { findAdapter, type AdapterSpec } from './adapters';

// =============================================================================
// Normalized Types
// =============================================================================

/** Dense block index for array-based access */
export type BlockIndex = number & { readonly __brand: 'BlockIndex' };

export interface NormalizedPatch {
  /** Original patch (for reference) */
  readonly patch: Patch;

  /** Map from BlockId to dense BlockIndex */
  readonly blockIndex: ReadonlyMap<BlockId, BlockIndex>;

  /** Blocks in index order (includes adapter blocks) */
  readonly blocks: readonly Block[];

  /** Edges with block indices instead of IDs */
  readonly edges: readonly NormalizedEdge[];
}

export interface NormalizedEdge {
  readonly fromBlock: BlockIndex;
  readonly fromPort: PortId;
  readonly toBlock: BlockIndex;
  readonly toPort: PortId;
}

// =============================================================================
// Normalization Results
// =============================================================================

export interface NormalizeResult {
  readonly kind: 'ok';
  readonly patch: NormalizedPatch;
}

export interface NormalizeError {
  readonly kind: 'error';
  readonly errors: readonly NormError[];
}

export type NormError =
  | { kind: 'DanglingEdge'; edge: Edge; missing: 'from' | 'to' }
  | { kind: 'DuplicateBlockId'; id: BlockId }
  | { kind: 'UnknownBlockType'; blockId: BlockId; blockType: string }
  | { kind: 'UnknownPort'; blockId: BlockId; portId: string; direction: 'input' | 'output' }
  | { kind: 'NoAdapterFound'; edge: Edge; fromType: string; toType: string };

// =============================================================================
// Default Source Materialization
// =============================================================================

interface DefaultSourceInsertion {
  /** The derived block to insert (e.g., Const, ConstVec2, ConstColor) */
  block: Block;
  /** The edge from derived block to the target input */
  edge: Edge;
}

/**
 * Check if an input has an incoming edge.
 */
function hasIncomingEdge(
  blockId: BlockId,
  portId: string,
  edges: readonly Edge[]
): boolean {
  return edges.some(
    e => e.enabled !== false &&
         e.to.blockId === blockId &&
         e.to.slotId === portId
  );
}

/**
 * Generate a deterministic default source block ID.
 */
function generateDefaultSourceId(blockId: BlockId, portId: string): BlockId {
  return `_ds_${blockId}_${portId}` as BlockId;
}

/**
 * Analyze blocks for unconnected inputs with default sources.
 */
function analyzeDefaultSources(patch: Patch): DefaultSourceInsertion[] {
  const insertions: DefaultSourceInsertion[] = [];

  for (const [blockId, block] of patch.blocks) {
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    for (const input of blockDef.inputs) {
      // Skip if already connected
      if (hasIncomingEdge(blockId, input.id, patch.edges)) continue;

      // Skip if no default source defined
      const ds = (input as InputDef & { defaultSource?: DefaultSource }).defaultSource;
      if (!ds) continue;

      // Create derived block based on default source kind
      const derivedId = generateDefaultSourceId(blockId, input.id);

      if (ds.kind === 'constant') {
        const derivedRole: BlockRole = {
          kind: 'derived',
          meta: {
            kind: 'defaultSource',
            target: { kind: 'port', port: { blockId, portId: input.id as PortId } },
          },
        };

        // All types now use the unified polymorphic Const block
        const derivedBlock: Block = {
          id: derivedId,
          type: 'Const',
          params: { value: ds.value, payloadType: input.type.payload },
          displayName: null,
          domainId: block.domainId,
          role: derivedRole,
        };

        const edge: Edge = {
          id: `${derivedId}_to_${blockId}_${input.id}`,
          from: {
            kind: 'port',
            blockId: derivedId,
            slotId: 'out',
          },
          to: {
            kind: 'port',
            blockId,
            slotId: input.id,
          },
          enabled: true,
        };

        insertions.push({ block: derivedBlock, edge });
      }
      // TODO: Handle 'rail' kind for phaseA/phaseB etc.
    }
  }

  return insertions;
}

// =============================================================================
// Polymorphic Type Resolution
// =============================================================================

/**
 * Resolve '???' (polymorphic) types by propagating concrete types bidirectionally.
 *
 * Type inference works in two directions:
 * 1. Forward (output -> target input): For blocks like Const, infer type from what it connects to
 * 2. Backward (source output -> input): For blocks like FieldBroadcast, infer type from source
 *
 * The resolved type is stored in the block's params as `payloadType`.
 *
 * Returns a new patch with updated block params.
 */
function resolvePolymorphicTypes(patch: Patch): Patch {
  const updatedBlocks = new Map(patch.blocks);

  for (const [blockId, block] of patch.blocks) {
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    // Already resolved?
    if (block.params.payloadType !== undefined) continue;

    let inferredPayloadType: string | undefined;

    // Strategy 1: Forward resolution - polymorphic OUTPUT infers from target input
    for (const output of blockDef.outputs) {
      if (output.type.payload !== '???') continue;

      const outgoingEdge = patch.edges.find(
        e => e.enabled !== false &&
             e.from.blockId === blockId &&
             e.from.slotId === output.id
      );

      if (!outgoingEdge) continue;

      const targetBlock = patch.blocks.get(outgoingEdge.to.blockId as BlockId);
      if (!targetBlock) continue;

      const targetDef = getBlockDefinition(targetBlock.type);
      if (!targetDef) continue;

      const targetInput = targetDef.inputs.find(i => i.id === outgoingEdge.to.slotId);
      if (!targetInput || targetInput.type.payload === '???') continue;

      inferredPayloadType = targetInput.type.payload;
      break;
    }

    // Strategy 2: Backward resolution - polymorphic INPUT infers from source output
    if (!inferredPayloadType) {
      for (const input of blockDef.inputs) {
        if (input.type.payload !== '???') continue;

        const incomingEdge = patch.edges.find(
          e => e.enabled !== false &&
               e.to.blockId === blockId &&
               e.to.slotId === input.id
        );

        if (!incomingEdge) continue;

        const sourceBlock = patch.blocks.get(incomingEdge.from.blockId as BlockId);
        if (!sourceBlock) continue;

        const sourceDef = getBlockDefinition(sourceBlock.type);
        if (!sourceDef) continue;

        const sourceOutput = sourceDef.outputs.find(o => o.id === incomingEdge.from.slotId);
        if (!sourceOutput) continue;

        // If source output is also polymorphic, check if it was already resolved
        if (sourceOutput.type.payload === '???') {
          const resolvedPayload = sourceBlock.params.payloadType ||
                                  updatedBlocks.get(sourceBlock.id)?.params.payloadType;
          if (resolvedPayload && resolvedPayload !== '???') {
            inferredPayloadType = resolvedPayload as string;
            break;
          }
          continue;
        }

        inferredPayloadType = sourceOutput.type.payload;
        break;
      }
    }

    // Update block params with inferred type
    if (inferredPayloadType) {
      const updatedBlock: Block = {
        ...block,
        params: {
          ...block.params,
          payloadType: inferredPayloadType,
        },
      };
      updatedBlocks.set(blockId, updatedBlock);
    }
  }

  return {
    blocks: updatedBlocks,
    edges: patch.edges,
  };
}

/**
 * Apply default source insertions to create an expanded patch.
 */
function applyDefaultSourceInsertions(
  patch: Patch,
  insertions: DefaultSourceInsertion[]
): Patch {
  if (insertions.length === 0) {
    return patch;
  }

  // Create new blocks map with derived blocks
  const newBlocks = new Map(patch.blocks);
  for (const ins of insertions) {
    newBlocks.set(ins.block.id, ins.block);
  }

  // Create new edges array with default source edges
  const newEdges: Edge[] = [...patch.edges];
  for (const ins of insertions) {
    newEdges.push(ins.edge);
  }

  return {
    blocks: newBlocks,
    edges: newEdges,
  };
}

// =============================================================================
// Adapter Insertion
// =============================================================================

interface AdapterInsertion {
  /** The adapter block to insert */
  block: Block;
  /** The edge from original source to adapter input */
  edgeToAdapter: Edge;
  /** The edge from adapter output to original target */
  edgeFromAdapter: Edge;
  /** The original edge ID being replaced */
  originalEdgeId: string;
}

/**
 * Generate a deterministic adapter block ID.
 */
function generateAdapterId(edgeId: string): BlockId {
  return `_adapter_${edgeId}` as BlockId;
}

/**
 * Get the SignalType for a port on a block.
 */
function getPortType(
  blockType: string,
  portId: string,
  direction: 'input' | 'output'
): SignalType | null {
  const blockDef = getBlockDefinition(blockType);
  if (!blockDef) return null;

  const ports = direction === 'input' ? blockDef.inputs : blockDef.outputs;
  const port = ports.find(p => p.id === portId);
  return port?.type ?? null;
}

/**
 * Analyze edges for type mismatches and determine needed adapter insertions.
 */
function analyzeAdapters(
  patch: Patch,
  errors: NormError[]
): AdapterInsertion[] {
  const insertions: AdapterInsertion[] = [];

  for (const edge of patch.edges) {
    // Skip disabled edges
    if (edge.enabled === false) continue;

    const fromBlock = patch.blocks.get(edge.from.blockId as BlockId);
    const toBlock = patch.blocks.get(edge.to.blockId as BlockId);

    // Skip if blocks don't exist (will be caught by dangling edge check)
    if (!fromBlock || !toBlock) continue;

    // Get port types
    let fromType = getPortType(fromBlock.type, edge.from.slotId, 'output');
    const toType = getPortType(toBlock.type, edge.to.slotId, 'input');

    // Skip if we can't determine types (block def missing)
    if (!fromType) {
      errors.push({
        kind: 'UnknownPort',
        blockId: fromBlock.id,
        portId: edge.from.slotId,
        direction: 'output',
      });
      continue;
    }
    if (!toType) {
      errors.push({
        kind: 'UnknownPort',
        blockId: toBlock.id,
        portId: edge.to.slotId,
        direction: 'input',
      });
      continue;
    }

    // If source type is polymorphic ('???'), check if it was resolved via params
    // This handles blocks like Const that have their type inferred from targets
    if (fromType.payload === '???') {
      const resolvedPayload = fromBlock.params.payloadType;
      if (resolvedPayload && resolvedPayload !== '???') {
        // Create a new type with the resolved payload
        fromType = { ...fromType, payload: resolvedPayload as typeof fromType.payload };
      }
    }

    // Look for adapter
    const adapterSpec = findAdapter(fromType, toType);

    if (adapterSpec) {
      // Create adapter block and edges
      const adapterId = generateAdapterId(edge.id);

      const adapterRole: BlockRole = {
        kind: 'derived',
        meta: {
          kind: 'adapter',
          edgeId: edge.id,
          adapterType: adapterSpec.blockType,
        },
      };

      // For polymorphic adapters, set payloadType from the source type
      // This resolves '???' types at adapter creation time
      const adapterBlock: Block = {
        id: adapterId,
        type: adapterSpec.blockType,
        params: { payloadType: fromType.payload },
        displayName: null,
        domainId: toBlock.domainId, // Inherit domain from target
        role: adapterRole,
      };

      const edgeToAdapter: Edge = {
        id: `${edge.id}_to_adapter`,
        from: edge.from,
        to: {
          kind: 'port',
          blockId: adapterId,
          slotId: adapterSpec.inputPortId,
        },
        enabled: true,
      };

      const edgeFromAdapter: Edge = {
        id: `${edge.id}_from_adapter`,
        from: {
          kind: 'port',
          blockId: adapterId,
          slotId: adapterSpec.outputPortId,
        },
        to: edge.to,
        enabled: true,
      };

      insertions.push({
        block: adapterBlock,
        edgeToAdapter,
        edgeFromAdapter,
        originalEdgeId: edge.id,
      });
    }
  }

  return insertions;
}

/**
 * Apply adapter insertions to create an expanded patch.
 */
function applyAdapterInsertions(
  patch: Patch,
  insertions: AdapterInsertion[]
): Patch {
  if (insertions.length === 0) {
    return patch;
  }

  // Build set of edge IDs being replaced
  const replacedEdgeIds = new Set(insertions.map(i => i.originalEdgeId));

  // Create new blocks map with adapter blocks
  const newBlocks = new Map(patch.blocks);
  for (const ins of insertions) {
    newBlocks.set(ins.block.id, ins.block);
  }

  // Create new edges array
  const newEdges: Edge[] = [];

  // Keep edges that aren't being replaced
  for (const edge of patch.edges) {
    if (!replacedEdgeIds.has(edge.id)) {
      newEdges.push(edge);
    }
  }

  // Add adapter edges
  for (const ins of insertions) {
    newEdges.push(ins.edgeToAdapter);
    newEdges.push(ins.edgeFromAdapter);
  }

  return {
    blocks: newBlocks,
    edges: newEdges,
  };
}

// =============================================================================
// Main Normalization
// =============================================================================

export function normalize(patch: Patch): NormalizeResult | NormalizeError {
  const errors: NormError[] = [];

  // Phase 0: Resolve '???' (polymorphic) types from their targets
  const patchWithInferredTypes = resolvePolymorphicTypes(patch);

  // Phase 1: Materialize default sources for unconnected inputs
  const dsInsertions = analyzeDefaultSources(patchWithInferredTypes);
  const patchWithDefaults = applyDefaultSourceInsertions(patchWithInferredTypes, dsInsertions);

  // Phase 2: Analyze and insert adapters
  const insertions = analyzeAdapters(patchWithDefaults, errors);
  const expandedPatch = applyAdapterInsertions(patchWithDefaults, insertions);

  // Phase 3: Build block index map
  const blockIndex = new Map<BlockId, BlockIndex>();
  const blocks: Block[] = [];

  // Sort blocks by ID for deterministic ordering
  const sortedBlockIds = [...expandedPatch.blocks.keys()].sort();

  for (const id of sortedBlockIds) {
    if (blockIndex.has(id)) {
      errors.push({ kind: 'DuplicateBlockId', id });
      continue;
    }
    const index = blocks.length as BlockIndex;
    blockIndex.set(id, index);
    blocks.push(expandedPatch.blocks.get(id)!);
  }

  // Phase 3: Normalize edges
  const normalizedEdges: NormalizedEdge[] = [];

  for (const edge of expandedPatch.edges) {
    // Skip disabled edges
    if (edge.enabled === false) continue;

    const fromIdx = blockIndex.get(edge.from.blockId as BlockId);
    const toIdx = blockIndex.get(edge.to.blockId as BlockId);

    if (fromIdx === undefined) {
      errors.push({ kind: 'DanglingEdge', edge, missing: 'from' });
      continue;
    }
    if (toIdx === undefined) {
      errors.push({ kind: 'DanglingEdge', edge, missing: 'to' });
      continue;
    }

    normalizedEdges.push({
      fromBlock: fromIdx,
      fromPort: edge.from.slotId as PortId,
      toBlock: toIdx,
      toPort: edge.to.slotId as PortId,
    });
  }

  // Sort edges for deterministic ordering (by target, then source)
  normalizedEdges.sort((a, b) => {
    if (a.toBlock !== b.toBlock) return a.toBlock - b.toBlock;
    if (a.toPort !== b.toPort) return a.toPort.localeCompare(b.toPort);
    if (a.fromBlock !== b.fromBlock) return a.fromBlock - b.fromBlock;
    return a.fromPort.localeCompare(b.fromPort);
  });

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return {
    kind: 'ok',
    patch: {
      patch, // Original patch (before adapters)
      blockIndex,
      blocks,
      edges: normalizedEdges,
    },
  };
}

// =============================================================================
// Query Helpers
// =============================================================================

/** Get all edges targeting a specific block/port */
export function getInputEdges(
  patch: NormalizedPatch,
  blockIdx: BlockIndex,
  portId: PortId
): readonly NormalizedEdge[] {
  return patch.edges.filter(
    (e) => e.toBlock === blockIdx && e.toPort === portId
  );
}

/** Get all edges from a specific block/port */
export function getOutputEdges(
  patch: NormalizedPatch,
  blockIdx: BlockIndex,
  portId: PortId
): readonly NormalizedEdge[] {
  return patch.edges.filter(
    (e) => e.fromBlock === blockIdx && e.fromPort === portId
  );
}
