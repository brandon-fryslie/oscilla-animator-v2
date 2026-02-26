import type { BlockId, PortId } from '../../types';
import type { BlockIndex } from './BlockIndex';
import type { CompilerGraph, CompilerGraphBlock } from './CompilerGraph';

export interface NormalizedPatch {
  /** Compiler-owned ID-addressed graph metadata */
  readonly graph: CompilerGraph;

  /** Map from BlockId to dense BlockIndex */
  readonly blockIndex: ReadonlyMap<BlockId, BlockIndex>;

  /** Blocks in index order (includes adapter blocks) */
  readonly blocks: readonly CompilerGraphBlock[];

  /** Edges with block indices instead of IDs */
  readonly edges: readonly NormalizedEdge[];
}

export interface NormalizedEdge {
  readonly fromBlock: BlockIndex;
  readonly fromPort: PortId;
  readonly toBlock: BlockIndex;
  readonly toPort: PortId;
  readonly alias: string;
}
