import type { BlockIndex } from '../compiler/ir/BlockIndex';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { BlockId } from '../types';

const blockIdReverseIndexCache = new WeakMap<CompiledProgramIR, ReadonlyMap<string, BlockIndex>>();

function buildBlockIdReverseIndex(
  program: CompiledProgramIR,
): ReadonlyMap<string, BlockIndex> {
  const reverse = new Map<string, BlockIndex>();
  for (const [numericBlockId, stringBlockId] of program.debugIndex.blockMap) {
    reverse.set(stringBlockId, numericBlockId);
  }
  return reverse;
}

export function getBlockIdReverseIndex(
  program: CompiledProgramIR,
): ReadonlyMap<string, BlockIndex> {
  const cached = blockIdReverseIndexCache.get(program);
  if (cached) return cached;

  // [LAW:one-source-of-truth] Keep block-id reverse lookup construction in one
  // runtime helper so all consumers share identical block provenance semantics.
  const reverse = buildBlockIdReverseIndex(program);
  blockIdReverseIndexCache.set(program, reverse);
  return reverse;
}

export function resolveBlockIndexFromBlockId(
  blockId: BlockId,
  program: CompiledProgramIR,
): BlockIndex | undefined {
  return getBlockIdReverseIndex(program).get(blockId as string);
}

export function resolveBlockIdFromIndex(
  blockIndex: BlockIndex,
  program: CompiledProgramIR,
): string | undefined {
  return program.debugIndex.blockMap.get(blockIndex);
}
