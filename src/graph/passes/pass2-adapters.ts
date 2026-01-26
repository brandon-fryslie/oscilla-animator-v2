/**
 * Pass 2: Adapter Insertion
 *
 * Inserts adapter blocks for type-mismatched edges.
 */

/**
 * ============================================================================
 * CONTRACT / NON-NEGOTIABLE BEHAVIOR
 * ============================================================================
 *
 * This pass performs *structural* adapter insertion.
 * It rewrites the graph by inserting explicit adapter blocks for edges whose
 * endpoint port types are incompatible.
 *
 * What this pass MUST do:
 *   - Decide adapter insertion ONLY from the *block registry port definitions*
 *     (i.e. `blockDef.inputs/outputs[portId].type`).
 *   - Use `findAdapter(fromType, toType)` as the only conversion policy.
 *   - Produce deterministic adapter IDs and deterministic edge IDs.
 *   - Preserve user intent:
 *       * original edge is replaced by two edges through the adapter
 *       * adapter block is marked derived with metadata pointing to the
 *         original edge
 *   - Keep adapter blocks semantically neutral:
 *       * adapter params remain empty
 *       * typing is not stamped here
 *
 * What this pass MUST NOT do:
 *   - NO inference/unification/constraint solving.
 *   - NO specialization from block instance params.
 *   - NO block-type special casing (Const is NOT special, Camera is NOT special).
 *   - NO fallback conversions (if `findAdapter` returns null, the connection is
 *     invalid and must be rejected later by the type system / diagnostics).
 *
 * Allowed future changes (safe evolutions):
 *   - Improve error reporting (e.g. include extracted signatures in messages).
 *   - Extend adapter insertion to cover new axes only if adapter policy remains
 *     entirely in `adapters.ts`.
 *   - Add batching/perf improvements, as long as determinism is preserved.
 *
 * Disallowed future changes:
 *   - Reading or writing inferred types to `block.params`.
 *   - Deciding adapters based on runtime values.
 */

import type { BlockId, PortId, BlockRole } from '../../types';
import type { SignalType } from '../../core/canonical-types';
import type { Block, Edge, Patch } from '../Patch';
import { getBlockDefinition, requireBlockDef } from '../../blocks/registry';
import { findAdapter, type AdapterSpec } from '../adapters';

/**
 * Check if a block has cardinalityMode: 'preserve'.
 * Such blocks adapt their output cardinality to match their input cardinality.
 */
function isCardinalityPreserving(blockType: string): boolean {
  const blockDef = getBlockDefinition(blockType);
  if (!blockDef?.cardinality) return false;
  return blockDef.cardinality.cardinalityMode === 'preserve';
}

// =============================================================================
// Error Types
// =============================================================================

export type AdapterError =
  | { kind: 'UnknownPort'; blockId: BlockId; portId: string; direction: 'input' | 'output' }
  | { kind: 'NoAdapterFound'; edge: Edge; fromType: string; toType: string };

export interface Pass2Result {
  readonly kind: 'ok';
  readonly patch: Patch;
}

export interface Pass2Error {
  readonly kind: 'error';
  readonly errors: readonly AdapterError[];
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
  const port = ports[portId];
  return port?.type ?? null;
}

/**
 * Analyze edges for type mismatches and determine needed adapter insertions.
 */
function analyzeAdapters(
  patch: Patch,
  errors: AdapterError[]
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

    // Normalization is structural: do not specialize types from block params here.
    // The constraint solver specializes types after normalization.

    // Look for adapter
    const adapterSpec = findAdapter(fromType, toType);

    if (adapterSpec) {
      // Skip Broadcast adapter for cardinality-preserving source blocks.
      // Such blocks output fields when their inputs are fields, so the static
      // type (cardinality: one) doesn't reflect runtime behavior.
      // The actual cardinality propagation happens at lowering time.
      if (adapterSpec.blockType === 'Broadcast' && isCardinalityPreserving(fromBlock.type)) {
        continue;
      }
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

      // Get block definition to create ports
      const adapterBlockDef = requireBlockDef(adapterSpec.blockType);

      // Create input ports from registry
      const inputPorts = new Map();
      for (const [inputId, inputDef] of Object.entries(adapterBlockDef.inputs)) {
        inputPorts.set(inputId, { id: inputId, combineMode: 'last' });
      }

      // Create output ports from registry
      const outputPorts = new Map();
      for (const [outputId, outputDef] of Object.entries(adapterBlockDef.outputs)) {
        outputPorts.set(outputId, { id: outputId });
      }

      // Adapter params are always empty; normalization is structural.
      // The constraint solver specializes types after normalization.
      const adapterParams: Record<string, unknown> = {};

      const adapterBlock: Block = {
        id: adapterId,
        type: adapterSpec.blockType,
        params: adapterParams,
        displayName: null,
        domainId: toBlock.domainId, // Inherit domain from target
        role: adapterRole,
        inputPorts,
        outputPorts,
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
        sortKey: edge.sortKey, // Preserve original sort key
        role: { kind: 'adapter', meta: { adapterId, originalEdgeId: edge.id } },
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
        sortKey: edge.sortKey, // Preserve original sort key
        role: { kind: 'adapter', meta: { adapterId, originalEdgeId: edge.id } },
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

/**
 * Insert adapters for type-mismatched edges.
 *
 * @param patch - Patch from Pass 1
 * @returns Patch with adapters, or errors
 */
export function pass2Adapters(patch: Patch): Pass2Result | Pass2Error {
  const errors: AdapterError[] = [];
  const insertions = analyzeAdapters(patch, errors);

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return { kind: 'ok', patch: applyAdapterInsertions(patch, insertions) };
}
