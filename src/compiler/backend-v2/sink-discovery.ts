/**
 * C1 Phase 3: Sink Discovery
 *
 * Finds blocks whose C1 definition has isSink: true.
 * These are the roots for the backward lowering walk.
 */

import type { NormalizedPatch } from '../ir/NormalizedPatch';
import type { BlockIndex } from '../ir/BlockIndex';
import { getC1Block } from '../../blocks-v2';

export function discoverSinks(
  topoOrder: readonly BlockIndex[],
  patch: NormalizedPatch,
): BlockIndex[] {
  const sinks: BlockIndex[] = [];
  for (const idx of topoOrder) {
    const block = patch.blocks[idx];
    const def = getC1Block(block.type);
    if (def?.isSink) {
      sinks.push(idx);
    }
  }
  return sinks;
}
