/**
 * Internal Store Types
 *
 * These types are used internally by stores but NOT exported from the public API.
 * This prevents external code from constructing store state directly.
 */

import type { Block, Edge } from '../graph/Patch';
import type { BlockId } from '../types';

/**
 * Internal mutable patch data structure.
 * This is the canonical storage format within PatchStore.
 * External code receives ImmutablePatch, not this.
 */
export interface PatchData {
  blocks: Map<BlockId, Block>;
  edges: Edge[];
}

/**
 * Helper to create empty patch data
 */
export function emptyPatchData(): PatchData {
  return {
    blocks: new Map(),
    edges: [],
  };
}
