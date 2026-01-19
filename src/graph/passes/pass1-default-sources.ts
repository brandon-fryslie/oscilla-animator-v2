/**
 * Pass 1: Default Source Materialization
 *
 * Inserts Const blocks for unconnected inputs with defaultSource.
 */

import type { BlockId, PortId, BlockRole, DefaultSource } from '../../types';
import type { Block, Edge, Patch } from '../Patch';
import { getBlockDefinition, type InputDef } from '../../blocks/registry';

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

      // Get default source from registry (block definition)
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

/**
 * Materialize default sources for unconnected inputs.
 *
 * @param patch - Patch from Pass 0
 * @returns Patch with Const blocks inserted
 */
export function pass1DefaultSources(patch: Patch): Patch {
  const insertions = analyzeDefaultSources(patch);
  return applyDefaultSourceInsertions(patch, insertions);
}
