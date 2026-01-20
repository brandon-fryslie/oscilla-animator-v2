/**
 * Pass 1: Default Source Materialization
 *
 * Inserts derived blocks for unconnected inputs with defaultSource.
 * TimeRoot defaults wire to existing TimeRoot; other defaults create derived blocks.
 */

import type { BlockId, PortId, BlockRole, DefaultSource } from '../../types';
import type { Block, Edge, Patch } from '../Patch';
import { getBlockDefinition, type InputDef } from '../../blocks/registry';

interface DefaultSourceInsertion {
  /** The derived block to insert (null for TimeRoot - already exists) */
  block: Block | null;
  /** The edge from source block to the target input */
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
 * Find the TimeRoot block in the patch.
 */
function findTimeRoot(patch: Patch): Block | null {
  for (const [, block] of patch.blocks) {
    if (block.type === 'TimeRoot') {
      return block;
    }
  }
  return null;
}

/**
 * Materialize a default source into a block and edge.
 */
function materializeDefaultSource(
  ds: DefaultSource,
  targetInput: InputDef,
  targetBlockId: BlockId,
  targetPortId: string,
  targetBlock: Block,
  patch: Patch
): DefaultSourceInsertion {

  if (ds.blockType === 'TimeRoot') {
    // Wire directly to existing TimeRoot
    const timeRoot = findTimeRoot(patch);
    if (!timeRoot) {
      throw new Error('DefaultSource references TimeRoot but no TimeRoot exists in patch');
    }

    const edge: Edge = {
      id: `${timeRoot.id}_${ds.output}_to_${targetBlockId}_${targetPortId}`,
      from: { kind: 'port', blockId: timeRoot.id, slotId: ds.output },
      to: { kind: 'port', blockId: targetBlockId, slotId: targetPortId },
      enabled: true,
    };

    return { block: null, edge };
  }

  // Create derived block instance
  const derivedId = generateDefaultSourceId(targetBlockId, targetPortId);

  const derivedRole: BlockRole = {
    kind: 'derived',
    meta: {
      kind: 'defaultSource',
      target: { kind: 'port', port: { blockId: targetBlockId, portId: targetPortId as PortId } },
    },
  };

  // Build params - for Const blocks, include payloadType from input type
  let params = ds.params ?? {};
  if (ds.blockType === 'Const') {
    params = { ...params, payloadType: targetInput.type.payload };
  }

  const derivedBlock: Block = {
    id: derivedId,
    type: ds.blockType,
    params,
    displayName: null,
    domainId: targetBlock.domainId,
    role: derivedRole,
  };

  const edge: Edge = {
    id: `${derivedId}_to_${targetBlockId}_${targetPortId}`,
    from: {
      kind: 'port',
      blockId: derivedId,
      slotId: ds.output,
    },
    to: {
      kind: 'port',
      blockId: targetBlockId,
      slotId: targetPortId,
    },
    enabled: true,
  };

  return { block: derivedBlock, edge };
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

      // Materialize the default source
      const insertion = materializeDefaultSource(ds, input, blockId, input.id, block, patch);
      insertions.push(insertion);
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
    if (ins.block !== null) {
      newBlocks.set(ins.block.id, ins.block);
    }
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
 * @returns Patch with derived blocks inserted and TimeRoot wired
 */
export function pass1DefaultSources(patch: Patch): Patch {
  const insertions = analyzeDefaultSources(patch);
  return applyDefaultSourceInsertions(patch, insertions);
}
