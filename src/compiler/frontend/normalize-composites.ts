/**
 * Pass 0: Composite Block Expansion
 *
 * Expands composite blocks into their internal graph structure.
 * This pass runs FIRST, before default source materialization,
 * so that all derived blocks from composites exist when other passes run.
 *
 * ============================================================================
 * CONTRACT / NON-NEGOTIABLE BEHAVIOR
 * ============================================================================
 *
 * What this pass MUST do:
 *   - Find all composite blocks in the patch
 *   - For each composite block:
 *     * Generate deterministic IDs for expanded blocks
 *     * Clone all internal blocks as derived blocks
 *     * Clone all internal edges with remapped IDs
 *     * Wire exposed inputs to external incoming edges
 *     * Wire exposed outputs to external outgoing edges
 *     * Remove the composite block from the patch
 *   - Handle nested composites (recursive expansion)
 *   - Preserve determinism via stable ID generation
 *   - Track expansion info for debugging/diagnostics
 *
 * What this pass MUST NOT do:
 *   - NO type inference or constraint solving
 *   - NO adapter insertion (that's pass2)
 *   - NO default source materialization (that's pass1)
 *   - NO mutation of existing non-composite blocks
 */

import type { BlockId, BlockRole, EdgeRole } from '../../types';
import type { Block, Edge, Patch, InputPort, OutputPort } from '../../graph/Patch';
import {
  getCompositeDefinition,
  isCompositeType,
  requireAnyBlockDef,
} from '../../blocks/registry';
import type {
  CompositeBlockDef,
  InternalBlockId,
  CompositeExpansionInfo,
} from '../../blocks/composite-types';
import { COMPOSITE_EXPANSION_PREFIX, MAX_COMPOSITE_NESTING_DEPTH } from '../../blocks/composite-types';

// =============================================================================
// Types
// =============================================================================

export interface CompositeExpansionResult {
  readonly kind: 'ok';
  readonly patch: Patch;
  /** Map from composite block ID to expansion info */
  readonly expansionMap: ReadonlyMap<string, CompositeExpansionInfo>;
}

export interface CompositeExpansionError {
  readonly kind: 'error';
  readonly errors: readonly ExpansionError[];
}

export interface ExpansionError {
  readonly kind: 'CompositeExpansion';
  readonly code: 'MAX_NESTING_EXCEEDED' | 'CIRCULAR_REFERENCE' | 'UNKNOWN_COMPOSITE' | 'EXPANSION_FAILED';
  readonly message: string;
  readonly compositeBlockId?: string;
  readonly compositeType?: string;
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a deterministic expanded block ID.
 * Format: _comp_{compositeInstanceId}_{internalBlockId}
 */
function generateExpandedBlockId(compositeBlockId: BlockId, internalBlockId: InternalBlockId): BlockId {
  return `${COMPOSITE_EXPANSION_PREFIX}${compositeBlockId}_${internalBlockId}` as BlockId;
}

/**
 * Generate a deterministic edge ID for internal edges.
 */
function generateInternalEdgeId(
  compositeBlockId: BlockId,
  fromBlockId: InternalBlockId,
  fromPort: string,
  toBlockId: InternalBlockId,
  toPort: string
): string {
  return `${COMPOSITE_EXPANSION_PREFIX}${compositeBlockId}_${fromBlockId}_${fromPort}_to_${toBlockId}_${toPort}`;
}

/**
 * Generate edge ID for exposed port wiring.
 */
function generateExposedEdgeId(
  compositeBlockId: BlockId,
  direction: 'in' | 'out',
  externalBlockId: string,
  externalPort: string,
  internalBlockId: InternalBlockId,
  internalPort: string
): string {
  return `${COMPOSITE_EXPANSION_PREFIX}${compositeBlockId}_${direction}_${externalBlockId}_${externalPort}_${internalBlockId}_${internalPort}`;
}

// =============================================================================
// Expansion Logic
// =============================================================================

/**
 * Expand a single composite block into derived blocks and edges.
 */
function expandCompositeBlock(
  compositeBlock: Block,
  compositeDef: CompositeBlockDef,
  originalEdges: readonly Edge[],
  sortKeyOffset: number
): {
  expandedBlocks: Block[];
  expandedEdges: Edge[];
  edgesToRemove: Set<string>;
  expansionInfo: CompositeExpansionInfo;
} {
  const expandedBlocks: Block[] = [];
  const expandedEdges: Edge[] = [];
  const edgesToRemove = new Set<string>();
  const expandedBlockIds: string[] = [];

  // Map from internal block ID to expanded block ID
  const internalToExpandedId = new Map<InternalBlockId, BlockId>();

  // Create the derived block role for composite expansion
  const createExpansionRole = (internalBlockId: InternalBlockId): BlockRole => ({
    kind: 'derived',
    meta: {
      kind: 'compositeExpansion',
      compositeDefId: compositeDef.type,
      compositeInstanceId: compositeBlock.id,
      internalBlockId: internalBlockId as string,
    },
  });

  // Step 1: Clone internal blocks as derived blocks
  for (const [internalId, internalDef] of compositeDef.internalBlocks) {
    const expandedId = generateExpandedBlockId(compositeBlock.id, internalId);
    internalToExpandedId.set(internalId, expandedId);
    expandedBlockIds.push(expandedId);

    // Get the internal block's definition to create proper ports
    const internalBlockDef = requireAnyBlockDef(internalDef.type);

    // Build input ports from the internal block definition
    const inputPorts = new Map<string, InputPort>();
    for (const [portId, inputDef] of Object.entries(internalBlockDef.inputs)) {
      if (inputDef.exposedAsPort !== false) {
        inputPorts.set(portId, {
          id: portId,
          defaultSource: inputDef.defaultSource,
          combineMode: 'last', // Default combine mode
        });
      }
    }

    // Build output ports from the internal block definition
    const outputPorts = new Map<string, OutputPort>();
    for (const [portId] of Object.entries(internalBlockDef.outputs)) {
      outputPorts.set(portId, { id: portId });
    }

    const expandedBlock: Block = {
      id: expandedId,
      type: internalDef.type,
      params: internalDef.params ?? {},
      displayName: internalDef.displayName ?? `${internalDef.type} (${compositeBlock.displayName})`,
      domainId: compositeBlock.domainId,
      role: createExpansionRole(internalId),
      inputPorts,
      outputPorts,
    };

    expandedBlocks.push(expandedBlock);
  }

  // Step 2: Clone internal edges with remapped IDs
  let edgeSortKey = sortKeyOffset;
  for (const internalEdge of compositeDef.internalEdges) {
    const fromExpandedId = internalToExpandedId.get(internalEdge.fromBlock);
    const toExpandedId = internalToExpandedId.get(internalEdge.toBlock);

    if (!fromExpandedId || !toExpandedId) {
      // This should have been caught during validation
      continue;
    }

    const edgeId = generateInternalEdgeId(
      compositeBlock.id,
      internalEdge.fromBlock,
      internalEdge.fromPort,
      internalEdge.toBlock,
      internalEdge.toPort
    );

    const expandedEdge: Edge = {
      id: edgeId,
      from: { kind: 'port', blockId: fromExpandedId, slotId: internalEdge.fromPort },
      to: { kind: 'port', blockId: toExpandedId, slotId: internalEdge.toPort },
      enabled: true,
      sortKey: edgeSortKey++,
      role: { kind: 'composite', meta: { compositeInstanceId: compositeBlock.id } },
    };

    expandedEdges.push(expandedEdge);
  }

  // Step 3: Wire exposed inputs - redirect external edges to internal blocks
  for (const exposedInput of compositeDef.exposedInputs) {
    const internalExpandedId = internalToExpandedId.get(exposedInput.internalBlockId);
    if (!internalExpandedId) continue;

    // Find edges that target the composite block's exposed input
    for (const edge of originalEdges) {
      if (
        edge.to.blockId === compositeBlock.id &&
        edge.to.slotId === exposedInput.externalId &&
        edge.enabled !== false
      ) {
        // Mark original edge for removal
        edgesToRemove.add(edge.id);

        // Create new edge from external source to internal block
        const rewiredEdge: Edge = {
          id: generateExposedEdgeId(
            compositeBlock.id,
            'in',
            edge.from.blockId,
            edge.from.slotId,
            exposedInput.internalBlockId,
            exposedInput.internalPortId
          ),
          from: edge.from,
          to: { kind: 'port', blockId: internalExpandedId, slotId: exposedInput.internalPortId },
          enabled: true,
          sortKey: edgeSortKey++,
          role: edge.role, // Preserve original role
        };

        expandedEdges.push(rewiredEdge);
      }
    }
  }

  // Step 4: Wire exposed outputs - redirect edges from composite to internal blocks
  for (const exposedOutput of compositeDef.exposedOutputs) {
    const internalExpandedId = internalToExpandedId.get(exposedOutput.internalBlockId);
    if (!internalExpandedId) continue;

    // Find edges that come from the composite block's exposed output
    for (const edge of originalEdges) {
      if (
        edge.from.blockId === compositeBlock.id &&
        edge.from.slotId === exposedOutput.externalId &&
        edge.enabled !== false
      ) {
        // Mark original edge for removal
        edgesToRemove.add(edge.id);

        // Create new edge from internal block to external target
        const rewiredEdge: Edge = {
          id: generateExposedEdgeId(
            compositeBlock.id,
            'out',
            edge.to.blockId,
            edge.to.slotId,
            exposedOutput.internalBlockId,
            exposedOutput.internalPortId
          ),
          from: { kind: 'port', blockId: internalExpandedId, slotId: exposedOutput.internalPortId },
          to: edge.to,
          enabled: true,
          sortKey: edgeSortKey++,
          role: edge.role, // Preserve original role
        };

        expandedEdges.push(rewiredEdge);
      }
    }
  }

  const expansionInfo: CompositeExpansionInfo = {
    compositeBlockId: compositeBlock.id,
    compositeDefId: compositeDef.type,
    expandedBlockIds,
  };

  return { expandedBlocks, expandedEdges, edgesToRemove, expansionInfo };
}

// =============================================================================
// Main Pass
// =============================================================================

/**
 * Pass 0: Expand all composite blocks.
 *
 * Iterates until no more composites remain (handles nested composites).
 * Returns the expanded patch plus expansion metadata for debugging.
 */
export function pass0CompositeExpansion(patch: Patch): CompositeExpansionResult | CompositeExpansionError {
  const errors: ExpansionError[] = [];
  const expansionMap = new Map<string, CompositeExpansionInfo>();

  // Track visited composites for cycle detection
  const visitedTypes = new Set<string>();
  let depth = 0;

  // Iteratively expand composites until none remain
  let currentPatch = patch;
  let hasComposites = true;

  while (hasComposites && depth < MAX_COMPOSITE_NESTING_DEPTH) {
    hasComposites = false;
    depth++;

    // Find all composite blocks in current patch
    const compositeBlocks: Array<{ block: Block; def: CompositeBlockDef }> = [];
    for (const [, block] of currentPatch.blocks) {
      if (isCompositeType(block.type)) {
        const def = getCompositeDefinition(block.type);
        if (def) {
          // Check for circular reference
          if (visitedTypes.has(block.type)) {
            errors.push({
              kind: 'CompositeExpansion',
              code: 'CIRCULAR_REFERENCE',
              message: `Circular reference detected while expanding composite "${block.type}"`,
              compositeBlockId: block.id,
              compositeType: block.type,
            });
            return { kind: 'error', errors };
          }
          compositeBlocks.push({ block, def });
          hasComposites = true;
        }
      }
    }

    if (!hasComposites) break;

    // Expand all composite blocks found in this iteration
    const newBlocks = new Map(currentPatch.blocks);
    let newEdges = [...currentPatch.edges];
    let sortKeyOffset = newEdges.length;

    for (const { block, def } of compositeBlocks) {
      visitedTypes.add(def.type);

      const result = expandCompositeBlock(block, def, newEdges, sortKeyOffset);

      // Remove the composite block
      newBlocks.delete(block.id);

      // Add expanded blocks
      for (const expandedBlock of result.expandedBlocks) {
        newBlocks.set(expandedBlock.id, expandedBlock);
      }

      // Remove edges that were rewired
      newEdges = newEdges.filter(e => !result.edgesToRemove.has(e.id));

      // Add expanded edges
      newEdges.push(...result.expandedEdges);

      // Update sort key offset
      sortKeyOffset = newEdges.length;

      // Store expansion info
      expansionMap.set(block.id, result.expansionInfo);

      visitedTypes.delete(def.type);
    }

    // Create new patch for next iteration
    currentPatch = {
      blocks: newBlocks,
      edges: newEdges,
    };
  }

  // Check if we hit max depth
  if (depth >= MAX_COMPOSITE_NESTING_DEPTH && hasComposites) {
    errors.push({
      kind: 'CompositeExpansion',
      code: 'MAX_NESTING_EXCEEDED',
      message: `Composite nesting depth exceeded maximum of ${MAX_COMPOSITE_NESTING_DEPTH} levels`,
    });
    return { kind: 'error', errors };
  }

  return {
    kind: 'ok',
    patch: currentPatch,
    expansionMap,
  };
}
