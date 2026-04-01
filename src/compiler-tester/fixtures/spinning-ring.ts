/**
 * Compiler Tester Fixture: Spinning Ring
 *
 * 64 dots in a ring, orbiting over time.
 * Matches the visual output of the `instanced-write` payload tester fixture.
 *
 * Graph: InfiniteTimeRoot --time--> RenderInstances2D
 *
 * This fixture builds a NormalizedPatch directly (bypasses frontend)
 * since the C1 block types don't need V1 type inference.
 */

import type { NormalizedPatch } from '../../compiler/ir/NormalizedPatch';
import type { CompilerGraph } from '../../compiler/ir/CompilerGraph';
import type { BlockIndex } from '../../compiler/ir/BlockIndex';
import type { BlockId, PortId } from '../../types/compiler';

export function makeSpinningRingPatch(): NormalizedPatch {
  const blocks = [
    { id: 'time', type: 'InfiniteTimeRoot', params: {} },
    { id: 'render', type: 'RenderInstances2D', params: { domainId: 'dots', capacity: 64 } },
  ] as const;

  const graph: CompilerGraph = {
    blocks: [...blocks],
    edges: [{
      id: 'e0',
      fromBlockId: 'time',
      fromPort: 'time' as PortId,
      toBlockId: 'render',
      toPort: 'time' as PortId,
      role: 'userWire',
    }],
  };

  return {
    graph,
    blockIndex: new Map([
      ['time' as BlockId, 0 as BlockIndex],
      ['render' as BlockId, 1 as BlockIndex],
    ]),
    blocks: [...blocks],
    edges: [{
      fromBlock: 0 as BlockIndex,
      fromPort: 'time' as PortId,
      toBlock: 1 as BlockIndex,
      toPort: 'time' as PortId,
      alias: 'time',
    }],
  };
}
