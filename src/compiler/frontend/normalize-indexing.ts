/**
 * Pass 3: Block Indexing and Edge Normalization
 *
 * Builds dense block indices and normalizes edges.
 */

/**
 * ============================================================================
 * CONTRACT / NON-NEGOTIABLE BEHAVIOR
 * ============================================================================
 *
 * This pass exists to do ONE thing: convert the Patch's sparse, ID-addressed
 * graph into a dense, index-addressed representation that later passes can
 * iterate efficiently and deterministically.
 *
 * What this file MUST do:
 *   - Build a stable, dense `BlockIndex` for every BlockId in the patch.
 *   - Produce a `blocks[]` array where `blocks[blockIndex.get(id)]` is the block.
 *   - Rewrite edges from (BlockId, PortId) to (BlockIndex, PortId).
 *   - Enforce determinism:
 *       * block ordering must be stable across runs (currently sorted by ID)
 *       * edge ordering must be stable across runs (currently sorted by target then source)
 *   - Detect only structural integrity issues that are *about indexing*:
 *       * missing from/to blocks (dangling edges)
 *       * duplicate block IDs (should be impossible, but keep the check)
 *
 * What this file MUST NOT do:
 *   - NO type inference, NO unit inference, NO constraint solving, NO unification.
 *   - NO adapter insertion, NO default-source materialization.
 *   - NO port validation beyond what is required to rewrite IDs to indices.
 *     (Unknown ports are handled elsewhere; this pass treats ports as opaque IDs.)
 *   - NO special-casing of particular block types or particular ports.
 *     (The only allowed special-casing in the entire normalization pipeline is
 *      TimeRoot wiring in pass1-default-sources; this pass stays generic.)
 *
 * Allowed future changes (safe evolutions):
 *   - Change ordering strategy *only* if determinism is preserved and documented
 *     (e.g. sort by insertion order captured in Patch metadata).
 *   - Add additional structural integrity checks that are still purely about
 *     ID→index normalization (e.g. detect duplicate edges after normalization).
 *   - Replace filter-based query helpers with indexed adjacency lists *as long
 *     as* the externally visible behavior remains identical.
 *
 * Disallowed future changes (will cause architectural drift):
 *   - Making `BlockIndex` depend on types/units/constraints.
 *   - Special-casing "generic" blocks here to "help" typing.
 *   - Mutating blocks/edges beyond the ID→index rewrite.
 *
 * If you think you need to do any of the disallowed items here, it means the
 * pass boundaries are being violated. Fix the pass boundaries instead.
 */

import type { BlockId, PortId } from '../../types';
import type { Block, Edge, Patch } from '../../graph/Patch';

// =============================================================================
// Type Exports
// =============================================================================

/** Dense block index for array-based access */
export type BlockIndex = number & { readonly __brand: 'BlockIndex' };

export function blockIndex(n: number): BlockIndex {
  return n as BlockIndex;
}

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
// Error Types
// =============================================================================

export type IndexingError =
  | { kind: 'DanglingEdge'; edge: Edge; missing: 'from' | 'to' }
  | { kind: 'DuplicateBlockId'; id: BlockId };

export interface Pass3Result {
  readonly kind: 'ok';
  readonly patch: NormalizedPatch;
}

export interface Pass3Error {
  readonly kind: 'error';
  readonly errors: readonly IndexingError[];
}

// =============================================================================
// Indexing Logic
// =============================================================================

/**
 * Build block indices and normalize edges.
 *
 * @param patch - Patch from Pass 2
 * @returns NormalizedPatch with indices, or errors
 */
export function pass3Indexing(patch: Patch): Pass3Result | Pass3Error {
  const errors: IndexingError[] = [];

  // Build block index map
  const blockIndex = new Map<BlockId, BlockIndex>();
  const blocks: Block[] = [];

  // Sort blocks by ID for deterministic ordering
  const sortedBlockIds = [...patch.blocks.keys()].sort();

  for (const id of sortedBlockIds) {
    if (blockIndex.has(id)) {
      errors.push({ kind: 'DuplicateBlockId', id });
      continue;
    }
    const index = blocks.length as BlockIndex;
    blockIndex.set(id, index);
    blocks.push(patch.blocks.get(id)!);
  }

  // Normalize edges
  const normalizedEdges: NormalizedEdge[] = [];

  for (const edge of patch.edges) {
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
    if (a.toPort !== b.toPort) return String(a.toPort).localeCompare(String(b.toPort));
    if (a.fromBlock !== b.fromBlock) return a.fromBlock - b.fromBlock;
    return String(a.fromPort).localeCompare(String(b.fromPort));
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
