/**
 * Pass 2: Lens Expansion & Adapter Auto-Insertion
 *
 * Part of graph normalization (called from src/graph/passes/index.ts).
 *
 * This pass has TWO PHASES that run in order:
 *
 * PHASE 1: Expand Explicit Lenses (expandExplicitLenses)
 *   - For each lens in InputPort.lenses, create a lens block
 *   - Insert deterministically between source and target
 *   - Lenses are user-controlled signal transformations (scaling, etc.)
 *   - Lenses are NOT adapters — they don't bridge type mismatches
 *
 * PHASE 2: Auto-Insert Adapters (autoInsertAdapters)
 *   - Check all edges for type mismatches (payload, unit, cardinality)
 *   - When a mismatch is found, look up a matching adapter via findAdapter()
 *   - If an adapter exists, insert an adapter block between source and target
 *   - If no adapter exists, report an error
 *
 * CONTRACT FOR PHASE 1 (expandExplicitLenses):
 *   - Input: Patch with user-defined lenses in InputPort.lenses
 *   - For each lens: create lens block, rewire edges through it
 *   - Lens block IDs: _lens_{portId}_{lensId} (deterministic)
 *   - Display names: {blockName}.{portId}.lenses.{lensId}
 *   - Output: Patch with lens blocks expanded, lenses field now empty
 *
 * CONTRACT FOR PHASE 2 (autoInsertAdapters):
 *   - Input: Patch (after Phase 1 expansion)
 *   - For each edge: check source/target port types via findAdapter()
 *   - If adapter found: insert adapter block, rewire edges
 *   - If no adapter and types mismatch: collect error
 *   - Output: Patch with adapter blocks inserted, or errors
 *
 * INVARIANTS:
 *   - Both phases preserve existing block behavior
 *   - Deterministic: same input → same output
 *   - Adapter insertion is automatic (compiler handles type bridging)
 *   - Lens expansion is explicit (user controls signal transformations)
 */

import type { BlockId, BlockRole } from '../../types';
import type { InferenceCanonicalType } from '../../core/inference-types';
import type { Block, Edge, Patch, LensAttachment } from '../../graph/Patch';
import { getBlockDefinition, requireBlockDef } from '../../blocks/registry';
import { findAdapter } from '../../blocks/adapter-spec';

/**
 * Check if a block has cardinalityMode: 'preserve'.
 * Such blocks adapt their output cardinality to match their input cardinality.
 */
function isCardinalityPreserving(blockType: string): boolean {
  const blockDef = getBlockDefinition(blockType);
  if (!blockDef?.cardinality) return false;
  return blockDef.cardinality.cardinalityMode === 'preserve';
}

/**
 * Parse sourceAddress to extract blockId and portId.
 * Format: "v1:blocks.{blockId}.outputs.{portId}"
 * Returns null if format doesn't match.
 */
function parseSourceAddress(addr: string): { blockId: string; portId: string } | null {
  const match = addr.match(/^v1:blocks\.(.+)\.outputs\.(.+)$/);
  if (!match) return null;
  return { blockId: match[1], portId: match[2] };
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
// Lens Expansion (Phase 1)
// =============================================================================

interface LensInsertion {
  /** The lens block to insert */
  block: Block;
  /** The edge from original source to lens input */
  edgeToLens: Edge;
  /** The edge from lens output to original target */
  edgeFromLens: Edge;
  /** The original edge ID being replaced */
  originalEdgeId: string;
  /** The block and port being modified */
  targetBlockId: BlockId;
  targetPortId: string;
}

/**
 * Generate a deterministic lens block ID.
 * Format: _lens_{portId}_{lensId}
 */
function generateLensBlockId(portId: string, lensId: string): BlockId {
  return `_lens_${portId}_${lensId}` as BlockId;
}

/**
 * Get the CanonicalType for a port on a block.
 */
function getPortType(
  blockType: string,
  portId: string,
  direction: 'input' | 'output'
): InferenceCanonicalType | null {
  const blockDef = getBlockDefinition(blockType);
  if (!blockDef) return null;

  const ports = direction === 'input' ? blockDef.inputs : blockDef.outputs;
  const port = ports[portId];
  return port?.type ?? null;
}

/**
 * Create a lens block from a LensAttachment.
 *
 * A lens block is a real block that performs the transformation.
 * The lensType determines what block type to create.
 */
function createLensBlock(
  portId: string,
  lens: LensAttachment,
  targetBlock: Block,
  lensBlockId: BlockId
): Block {
  // The lens.lensType should correspond to a block type (e.g., 'Adapter_DegreesToRadians')
  const lensBlockDef = requireBlockDef(lens.lensType);

  // Create input ports from registry
  const inputPorts = new Map();
  for (const [inputId] of Object.entries(lensBlockDef.inputs)) {
    inputPorts.set(inputId, { id: inputId, combineMode: 'last' });
  }

  // Create output ports from registry
  const outputPorts = new Map();
  for (const [outputId] of Object.entries(lensBlockDef.outputs)) {
    outputPorts.set(outputId, { id: outputId });
  }

  // Use lens params if provided, otherwise empty
  const lensParams = lens.params ?? {};

  // For now, use adapter meta since lens is primarily for editor tracking
  // Once lens-specific metadata is needed, we can update this
  const lensRole: BlockRole = {
    kind: 'derived',
    meta: {
      kind: 'adapter',
      edgeId: '', // Will be set per-edge
      adapterType: lens.lensType,
    },
  };

  // Display name format: {targetBlockName}.{portId}.lenses.{lensId}
  const displayName = `${targetBlock.displayName}.${portId}.lenses.${lens.id}`;

  return {
    id: lensBlockId,
    type: lens.lensType,
    params: lensParams,
    displayName,
    domainId: targetBlock.domainId, // Inherit domain from target
    role: lensRole,
    inputPorts,
    outputPorts,
  };
}

/**
 * Analyze lenses and determine needed lens block insertions.
 *
 * Returns a list of lens blocks to insert and how to rewire edges.
 */
function analyzeLenses(
  patch: Patch,
  errors: AdapterError[]
): LensInsertion[] {
  const insertions: LensInsertion[] = [];

  for (const [blockId, block] of patch.blocks) {
    for (const [portId, port] of block.inputPorts) {
      // Skip if no lenses defined for this port
      if (!port.lenses || port.lenses.length === 0) continue;

      for (const lens of port.lenses) {
        // Find edges targeting this (block, port) pair that match the lens's sourceAddress
        const expectedSource = parseSourceAddress(lens.sourceAddress);

        for (const edge of patch.edges) {
          if (edge.enabled === false) continue;
          if (edge.to.kind !== 'port') continue;
          if (edge.from.kind !== 'port') continue;
          if (edge.to.blockId !== blockId || edge.to.slotId !== portId) continue;

          // Match lens to the specific source edge via sourceAddress
          if (expectedSource &&
              (edge.from.blockId !== expectedSource.blockId ||
               edge.from.slotId !== expectedSource.portId)) {
            continue;
          }

          // Create lens block
          const lensBlockId = generateLensBlockId(portId, lens.id);
          const lensBlock = createLensBlock(portId, lens, block, lensBlockId);

          // Find the lens block definition to get input/output port IDs
          const lensBlockDef = getBlockDefinition(lens.lensType);
          if (!lensBlockDef) {
            errors.push({
              kind: 'UnknownPort',
              blockId: lensBlockId,
              portId: 'unknown',
              direction: 'input',
            });
            continue;
          }

          const inputPortId = Object.keys(lensBlockDef.inputs)[0] ?? 'in';
          const outputPortId = Object.keys(lensBlockDef.outputs)[0] ?? 'out';

          // Create edges: source → lens input, lens output → target
          const edgeToLens: Edge = {
            id: `${edge.id}_to_lens`,
            from: edge.from,
            to: {
              kind: 'port',
              blockId: lensBlockId,
              slotId: inputPortId,
            },
            enabled: true,
            sortKey: edge.sortKey,
            role: { kind: 'adapter', meta: { adapterId: lensBlockId, originalEdgeId: edge.id } },
          };

          const edgeFromLens: Edge = {
            id: `${edge.id}_from_lens`,
            from: {
              kind: 'port',
              blockId: lensBlockId,
              slotId: outputPortId,
            },
            to: edge.to,
            enabled: true,
            sortKey: edge.sortKey,
            role: { kind: 'adapter', meta: { adapterId: lensBlockId, originalEdgeId: edge.id } },
          };

          insertions.push({
            block: lensBlock,
            edgeToLens,
            edgeFromLens,
            originalEdgeId: edge.id,
            targetBlockId: blockId,
            targetPortId: portId,
          });
        }
      }
    }
  }

  return insertions;
}

/**
 * Apply lens insertions to create an expanded patch.
 *
 * After expansion, the lenses field is cleared from the port.
 */
function applyLensInsertions(
  patch: Patch,
  insertions: LensInsertion[]
): Patch {
  if (insertions.length === 0) {
    return patch;
  }

  // Build set of edge IDs being replaced
  const replacedEdgeIds = new Set(insertions.map(i => i.originalEdgeId));

  // Create new blocks map with lens blocks
  const newBlocks = new Map(patch.blocks);

  // Add lens blocks
  for (const ins of insertions) {
    newBlocks.set(ins.block.id, ins.block);
  }

  // Clear lenses from ports (they've been expanded to blocks)
  for (const ins of insertions) {
    const block = newBlocks.get(ins.targetBlockId);
    if (block) {
      const port = block.inputPorts.get(ins.targetPortId);
      if (port && port.lenses) {
        const newPort = { ...port, lenses: undefined };
        const newInputPorts = new Map(block.inputPorts);
        newInputPorts.set(ins.targetPortId, newPort);
        const newBlock = { ...block, inputPorts: newInputPorts };
        newBlocks.set(ins.targetBlockId, newBlock);
      }
    }
  }

  // Create new edges array
  const newEdges: Edge[] = [];

  // Keep edges that aren't being replaced
  for (const edge of patch.edges) {
    if (!replacedEdgeIds.has(edge.id)) {
      newEdges.push(edge);
    }
  }

  // Add lens edges
  for (const ins of insertions) {
    newEdges.push(ins.edgeToLens);
    newEdges.push(ins.edgeFromLens);
  }

  return {
    blocks: newBlocks,
    edges: newEdges,
  };
}

/**
 * PHASE 1: Expand explicit lenses
 *
 * For each lens defined in InputPort.lenses, creates a lens block and rewires edges.
 * This is independent of type checking (Phase 2).
 */
function expandExplicitLenses(patch: Patch): Pass2Result | Pass2Error {
  const errors: AdapterError[] = [];
  const insertions = analyzeLenses(patch, errors);

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return { kind: 'ok', patch: applyLensInsertions(patch, insertions) };
}

// =============================================================================
// Type Validation (Phase 2)
// =============================================================================

/**
 * PHASE 2: Auto-insert adapters when type mismatch is detected.
 *
 * Adapter insertion dispatches on CanonicalType via findAdapter(). The
 * isCardinalityPreserving check prevents spurious Broadcast adapter insertion
 * for blocks that naturally preserve cardinality.
 *
 * CONTRACT:
 *   - Input: Patch (after Phase 1 lens expansion)
 *   - For each edge with type mismatch, check if adapter exists
 *   - If yes: insert adapter block
 *   - If no: report error
 *   - Output: Patch with auto-inserted adapters, or errors
 */
function autoInsertAdapters(patch: Patch): Pass2Result | Pass2Error {
  const errors: AdapterError[] = [];
  const insertions: Array<{
    block: Block;
    edgeToAdapter: Edge;
    edgeFromAdapter: Edge;
    originalEdgeId: string;
  }> = [];

  for (const edge of patch.edges) {
    if (edge.enabled === false) continue;
    if (edge.from.kind !== 'port') continue;
    if (edge.to.kind !== 'port') continue;

    const fromBlock = patch.blocks.get(edge.from.blockId as BlockId);
    const toBlock = patch.blocks.get(edge.to.blockId as BlockId);

    if (!fromBlock || !toBlock) continue;

    const fromType = getPortType(fromBlock.type, edge.from.slotId, 'output');
    const toType = getPortType(toBlock.type, edge.to.slotId, 'input');

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

    // Try to find adapter for this type pair
    // If no adapter is needed (types match), findAdapter returns null and we skip
    const adapterSpec = findAdapter(fromType, toType);

    if (adapterSpec) {
      // Skip Broadcast adapter for cardinality-preserving source blocks
      if (adapterSpec.blockType === 'Broadcast' && isCardinalityPreserving(fromBlock.type)) {
        continue;
      }

      // Auto-insert adapter block for type mismatch
      const adapterId = `_adapter_${edge.id}` as BlockId;
      const adapterBlockDef = requireBlockDef(adapterSpec.blockType);

      const inputPorts = new Map();
      for (const [inputId] of Object.entries(adapterBlockDef.inputs)) {
        inputPorts.set(inputId, { id: inputId, combineMode: 'last' });
      }

      const outputPorts = new Map();
      for (const [outputId] of Object.entries(adapterBlockDef.outputs)) {
        outputPorts.set(outputId, { id: outputId });
      }

      const adapterBlock: Block = {
        id: adapterId,
        type: adapterSpec.blockType,
        params: {},
        displayName: `${adapterSpec.blockType} (adapter)`,
        domainId: toBlock.domainId,
        role: {
          kind: 'derived',
          meta: {
            kind: 'adapter',
            edgeId: edge.id,
            adapterType: adapterSpec.blockType,
          },
        },
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
        sortKey: edge.sortKey,
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
        sortKey: edge.sortKey,
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

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  // Apply adapter insertions
  if (insertions.length === 0) {
    return { kind: 'ok', patch };
  }

  const replacedEdgeIds = new Set(insertions.map(i => i.originalEdgeId));
  const newBlocks = new Map(patch.blocks);

  for (const ins of insertions) {
    newBlocks.set(ins.block.id, ins.block);
  }

  const newEdges: Edge[] = [];
  for (const edge of patch.edges) {
    if (!replacedEdgeIds.has(edge.id)) {
      newEdges.push(edge);
    }
  }

  for (const ins of insertions) {
    newEdges.push(ins.edgeToAdapter);
    newEdges.push(ins.edgeFromAdapter);
  }

  return { kind: 'ok', patch: { blocks: newBlocks, edges: newEdges } };
}

// =============================================================================
// Main Pass Function (Orchestration)
// =============================================================================

/**
 * Pass 2: Execute both phases in order
 *
 * 1. Phase 1: Expand explicit lenses
 * 2. Phase 2: Auto-insert adapters for type mismatches
 *
 * @param patch - Patch from Pass 1
 * @returns Patch with lenses expanded and adapters inserted, or errors
 */
export function pass2Adapters(patch: Patch): Pass2Result | Pass2Error {
  // Phase 1: Expand explicit lenses
  const p1Result = expandExplicitLenses(patch);
  if (p1Result.kind === 'error') {
    return p1Result;
  }

  // Phase 2: Auto-insert adapters for type mismatches
  const p2Result = autoInsertAdapters(p1Result.patch);
  return p2Result;
}
