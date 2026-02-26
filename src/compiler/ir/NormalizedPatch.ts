import type { BlockId, PortId } from '../../types';
import type { Block, Patch } from '../../graph/Patch';
import type { BlockIndex } from './BlockIndex';

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

