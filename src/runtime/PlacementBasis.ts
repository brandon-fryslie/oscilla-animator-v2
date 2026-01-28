/**
 * PlacementBasis - Stable per-element placement coordinates
 *
 * Provides gauge-invariant coordinates for layouts that persist
 * across element count changes and hot-swap.
 *
 * @module PlacementBasis
 */

import type { BasisKind } from '../compiler/ir/types';

/**
 * Maximum elements per instance for PlacementBasis pre-allocation.
 * Matches renderer limit. Update this constant if renderer limit changes.
 */
export const MAX_ELEMENTS = 10_000;

/**
 * Per-instance placement basis buffers.
 * Pre-allocated to MAX_ELEMENTS. Persists across frames and hot-swap.
 */
export interface PlacementBasisBuffers {
  readonly uv: Float32Array;      // MAX_ELEMENTS * 2 floats
  readonly rank: Float32Array;    // MAX_ELEMENTS floats
  readonly seed: Float32Array;    // MAX_ELEMENTS floats
  readonly basisKind: BasisKind;  // Generation algorithm used
}
