/**
 * Reachability Analysis for Compilation
 *
 * Computes which blocks are reachable from render blocks.
 * Used to filter errors: unreachable blocks don't fail compilation.
 */

import type { Block, BlockIndex, NormalizedEdge } from './ir/patches';
import { getBlockDefinition } from '../blocks/registry';

/**
 * Find all render blocks in the graph.
 * Render blocks have `capability === 'render'` in their block definition.
 */
function findRenderBlocks(
  blocks: readonly Block[]
): Array<{ block: Block; index: BlockIndex }> {
  const result: Array<{ block: Block; index: BlockIndex }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const def = getBlockDefinition(block.type);
    if (def?.capability === 'render') {
      result.push({ block, index: i as BlockIndex });
    }
  }

  return result;
}

/**
 * Compute set of blocks reachable from render blocks.
 *
 * A block is reachable if it transitively feeds into any render block.
 * Uses backward traversal from render blocks through the edge graph.
 *
 * @param blocks - Block array from validated graph
 * @param edges - Edge array from validated graph
 * @returns Set of BlockIndex values for all reachable blocks
 */
export function computeRenderReachableBlocks(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[]
): Set<BlockIndex> {
  // Find all render blocks
  const renderBlocks = findRenderBlocks(blocks);

  // BFS backward from render blocks
  const reachable = new Set<BlockIndex>();
  const queue: BlockIndex[] = renderBlocks.map(r => r.index);

  while (queue.length > 0) {
    const blockIdx = queue.shift()!;

    // Skip if already visited
    if (reachable.has(blockIdx)) continue;

    // Mark as reachable
    reachable.add(blockIdx);

    // Find all edges targeting this block and add their sources to the queue
    for (const edge of edges) {
      if (edge.toBlock === blockIdx && !reachable.has(edge.fromBlock)) {
        queue.push(edge.fromBlock);
      }
    }
  }

  return reachable;
}
