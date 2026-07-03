/**
 * src/pillars/types/solve/contract-lookup.ts
 *
 * The single contract-lookup rule: a block's synthetic contract (system
 * blocks carry theirs inline on the MutableBlock) wins over the catalog entry
 * for its type. [LAW:single-enforcer]
 */

import type { DefinedBlock } from '../../block-api';
import type { ZBlockContract } from '../schemas';
import type { MutableBlock } from './typed-graph';

export function getContract(
  block: MutableBlock,
  catalog: readonly DefinedBlock[],
): ZBlockContract | undefined {
  if (block.syntheticContract !== undefined) return block.syntheticContract;
  return catalog.find((d) => d.type === block.type)?.contract;
}
