/**
 * Pass 1: Default Source Materialization
 *
 * Inserts derived blocks for unconnected inputs with defaultSource.
 * TimeRoot defaults wire to existing TimeRoot; other defaults create derived blocks.
 * Iterates until all nested default sources are materialized.
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
  if (ds.blockType === 'Const' && targetInput.type) {
    params = { ...params, payloadType: targetInput.type.payload };
  }

  const derivedBlock: Block = {
    id: derivedId,
    type: ds.blockType,
    params,
    displayName: null,
    domainId: targetBlock.domainId,
    role: derivedRole,
    inputPorts: new Map(), // Will be populated recursively if this block has inputs
    outputPorts: new Map(), // Will be populated recursively
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

    for (const [inputId, input] of Object.entries(blockDef.inputs)) {
      // CRITICAL FIX: Skip config-only inputs (exposedAsPort: false)
      // These are NOT ports and should NOT have edges or default sources materialized
      if (input.exposedAsPort === false) continue;

      // Skip if already connected
      if (hasIncomingEdge(blockId, inputId, patch.edges)) continue;

      // Get effective default source:
      // 1. Check port-level override first
      const portOverride = block.inputPorts.get(inputId)?.defaultSource;
      // 2. Fall back to registry default
      const registryDefault = (input as InputDef & { defaultSource?: DefaultSource }).defaultSource;
      const effectiveDefault = portOverride ?? registryDefault;

      if (!effectiveDefault) continue;

      // Materialize the effective default source
      const insertion = materializeDefaultSource(effectiveDefault, input, blockId, inputId, block, patch);
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
      // Populate ports for the derived block
      const blockDef = getBlockDefinition(ins.block.type);
      if (blockDef) {
        // Create input ports (ONLY for exposed ports)
        const inputPorts = new Map();
        for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
          // Skip config-only inputs when creating ports
          if (inputDef.exposedAsPort === false) continue;
          inputPorts.set(inputId, { id: inputId });
        }
        // Create output ports
        const outputPorts = new Map();
        for (const [outputId, outputDef] of Object.entries(blockDef.outputs)) {
          outputPorts.set(outputId, { id: outputId });
        }
        // Update the block with ports
        const blockWithPorts: Block = {
          ...ins.block,
          inputPorts,
          outputPorts,
        };
        newBlocks.set(blockWithPorts.id, blockWithPorts);
      } else {
        newBlocks.set(ins.block.id, ins.block);
      }
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
 * Iterates until all nested default sources are resolved.
 *
 * @param patch - Patch from Pass 0
 * @returns Patch with derived blocks inserted and TimeRoot wired
 */
export function pass1DefaultSources(patch: Patch): Patch {
  let currentPatch = patch;
  let iteration = 0;
  const MAX_ITERATIONS = 100; // Safety limit to prevent infinite loops

  while (iteration < MAX_ITERATIONS) {
    const insertions = analyzeDefaultSources(currentPatch);

    if (insertions.length === 0) {
      // No more default sources to materialize
      break;
    }

    currentPatch = applyDefaultSourceInsertions(currentPatch, insertions);
    iteration++;
  }

  if (iteration >= MAX_ITERATIONS) {
    throw new Error('Pass 1 exceeded maximum iterations - possible circular default source dependency');
  }

  return currentPatch;
}
