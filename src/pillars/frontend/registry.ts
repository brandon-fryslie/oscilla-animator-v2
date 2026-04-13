import type { BlockDefinition } from '../block-api';

export interface Registry {
  readonly get: (type: string) => BlockDefinition<unknown> | undefined;
  readonly types: () => readonly string[];
}

export function buildRegistry(
  blocks: readonly BlockDefinition<unknown>[],
): Registry {
  const byType = new Map<string, BlockDefinition<unknown>>();
  for (const block of blocks) {
    if (byType.has(block.type)) {
      throw new Error(`[pillars] Duplicate block type in registry: '${block.type}'`);
    }
    byType.set(block.type, block);
  }
  return {
    get: (type) => byType.get(type),
    types: () => Array.from(byType.keys()),
  };
}
