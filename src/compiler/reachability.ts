/**
 * Reachability Analysis for Compilation
 *
 * Computes which blocks contribute to the patch's rendered output.
 * Traverses backward from render blocks through edges to find all
 * blocks that feed into the output. Blocks not on this path don't
 * affect rendering and their errors can be suppressed.
 */

import type { Block, BlockIndex, NormalizedEdge } from './ir/patches';
import { getBlockDefinition } from '../blocks/registry';

/**
 * Find all render blocks (output sinks) in the graph.
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
 * Compute set of blocks that contribute to rendered output.
 *
 * A block is "render-reachable" if it transitively feeds into any render block.
 * Uses backward traversal from render blocks through the edge graph.
 *
 * If the patch has no render blocks, the returned set is empty — meaning
 * no block contributes to output and error isolation cannot apply.
 *
 * @param blocks - Block array from validated graph
 * @param edges - Edge array from validated graph
 * @returns Set of BlockIndex values for all blocks that feed into render output
 */
export function computeRenderReachableBlocks(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[]
): Set<BlockIndex> {
  const renderBlocks = findRenderBlocks(blocks);

  // BFS backward from render blocks through edges
  const reachable = new Set<BlockIndex>();
  const queue: BlockIndex[] = renderBlocks.map(r => r.index);

  while (queue.length > 0) {
    const blockIdx = queue.shift()!;

    if (reachable.has(blockIdx)) continue;

    reachable.add(blockIdx);

    // Find all edges targeting this block and add their sources
    for (const edge of edges) {
      if (edge.toBlock === blockIdx && !reachable.has(edge.fromBlock)) {
        queue.push(edge.fromBlock);
      }
    }
  }

  return reachable;
}
