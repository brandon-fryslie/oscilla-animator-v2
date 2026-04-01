/**
 * C1 Block Registry
 *
 * [LAW:one-source-of-truth] Maps block type strings to their C1 lowering definitions.
 * Separate from the V1 BlockDef registry — this contains only manifest + lower functions.
 */

import type { BlockDefC1 } from '../compiler/backend-v2/types';

const C1_BLOCK_REGISTRY = new Map<string, BlockDefC1>();

/**
 * Register a C1 block lowering definition.
 * Called at module load time by each block file.
 */
export function registerC1Block(type: string, def: BlockDefC1): void {
  if (C1_BLOCK_REGISTRY.has(type)) {
    throw new Error(`[C1 Registry] Duplicate block registration: '${type}'`);
  }
  C1_BLOCK_REGISTRY.set(type, def);
}

/**
 * Look up a C1 block definition by type string.
 */
export function getC1Block(type: string): BlockDefC1 | undefined {
  return C1_BLOCK_REGISTRY.get(type);
}

/**
 * Get all registered C1 block types (for diagnostics/testing).
 */
export function getRegisteredC1Types(): readonly string[] {
  return [...C1_BLOCK_REGISTRY.keys()];
}
