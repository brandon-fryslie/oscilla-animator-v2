/**
 * C1 Phase 1: Topological Sort
 *
 * Kahn's algorithm on NormalizedPatch edges.
 * Returns BlockIndex[] in topological order (sources first, sinks last).
 * Throws on cycles.
 */

import type { NormalizedPatch } from '../ir/NormalizedPatch';
import type { BlockIndex } from '../ir/BlockIndex';

export function topoSort(patch: NormalizedPatch): BlockIndex[] {
  const blockCount = patch.blocks.length;
  const inDegree = new Int32Array(blockCount);
  const adjacency: number[][] = Array.from({ length: blockCount }, () => []);

  // Build adjacency from edges
  for (const edge of patch.edges) {
    adjacency[edge.fromBlock].push(edge.toBlock);
    inDegree[edge.toBlock]++;
  }

  // BFS from zero in-degree nodes
  const queue: number[] = [];
  for (let i = 0; i < blockCount; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const result: BlockIndex[] = [];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    result.push(node as BlockIndex);
    for (const neighbor of adjacency[node]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  if (result.length !== blockCount) {
    throw new Error(
      `[C1] Cycle detected: processed ${result.length} of ${blockCount} blocks`
    );
  }

  return result;
}
