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
 * Golden ratio conjugate (1/φ) for low-discrepancy sequences.
 */
const PHI = 0.6180339887498949;

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

// =============================================================================
// Generation Functions
// =============================================================================

/**
 * Generate 1D Halton sequence value for index i.
 * Pure function - no side effects.
 *
 * @param index - Element index
 * @param base - Base for Halton sequence (typically 2, 3, 5, 7, ...)
 * @returns Value in [0, 1]
 */
export function halton(index: number, base: number): number {
  if (typeof index !== 'number' || typeof base !== 'number') {
    throw new Error('halton: index and base are required numbers');
  }
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * Generate 2D Halton sequence value for index i.
 * Pure function - no side effects.
 *
 * @param index - Element index
 * @param base1 - Base for first dimension
 * @param base2 - Base for second dimension
 * @returns [u, v] in [0, 1] x [0, 1]
 */
export function halton2D(index: number, base1: number, base2: number): [number, number] {
  if (typeof base1 !== 'number' || typeof base2 !== 'number') {
    throw new Error('halton2D: base1 and base2 are required numbers');
  }
  return [halton(index, base1), halton(index, base2)];
}

/**
 * Generate rank value for index i.
 * Uses golden ratio for low-discrepancy 1D sequence.
 * Pure function - no side effects.
 *
 * @param i - Element index
 * @returns Rank value in [0, 1)
 */
export function generateRank(i: number): number {
  if (typeof i !== 'number') {
    throw new Error('generateRank: index is required number');
  }
  return (i * PHI) % 1.0;
}

/**
 * Simple string hash (djb2 variant).
 * Pure function - no side effects.
 *
 * @param str - String to hash
 * @returns Unsigned 32-bit integer hash
 */
function hashString(str: string): number {
  if (typeof str !== 'string') {
    throw new Error('hashString: str is required string');
  }
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Ensure unsigned
}

/**
 * Generate deterministic seed for instance+element.
 * Pure function - no side effects.
 *
 * @param instanceId - Instance identifier
 * @param elementIndex - Element index
 * @returns Seed value in [0, 1]
 */
export function generateSeed(instanceId: string, elementIndex: number): number {
  if (typeof instanceId !== 'string') {
    throw new Error('generateSeed: instanceId is required string');
  }
  if (typeof elementIndex !== 'number') {
    throw new Error('generateSeed: elementIndex is required number');
  }
  const hash = hashString(instanceId) ^ (elementIndex * 2654435761);
  return (hash >>> 0) / 4294967295; // Normalize to [0,1]
}

/**
 * Generate UV coordinate based on BasisKind.
 * Pure function - no side effects.
 *
 * @param basisKind - Generation algorithm
 * @param index - Element index
 * @param instanceId - Instance identifier (used for random seed)
 * @returns [u, v] in [0, 1] x [0, 1]
 */
export function generateUV(
  basisKind: BasisKind,
  index: number,
  instanceId: string
): [number, number] {
  if (!basisKind) {
    throw new Error('generateUV: basisKind is required');
  }

  switch (basisKind) {
    case 'halton2D':
      return halton2D(index, 2, 3);

    case 'random': {
      // Use seed-derived pseudo-random
      const seed1 = generateSeed(instanceId, index * 2);
      const seed2 = generateSeed(instanceId, index * 2 + 1);
      return [seed1, seed2];
    }

    case 'spiral': {
      // Fermat spiral for good circle coverage
      const angle = index * PHI * 2 * Math.PI;
      const radius = Math.sqrt(index / MAX_ELEMENTS);
      return [
        0.5 + 0.5 * radius * Math.cos(angle),
        0.5 + 0.5 * radius * Math.sin(angle),
      ];
    }

    case 'grid': {
      // Grid-aligned using Halton but snapped
      const [u, v] = halton2D(index, 2, 3);
      return [u, v]; // Grid snapping done by kernel if needed
    }

    default: {
      const _exhaustive: never = basisKind;
      throw new Error(`Unknown basisKind: ${_exhaustive}`);
    }
  }
}

// =============================================================================
// Buffer Management
// =============================================================================

/**
 * Fill placement basis buffers for a range of indices.
 * Uses buffer pool for temporary allocations.
 *
 * @param buffers - Target buffers (pre-allocated to MAX_ELEMENTS)
 * @param instanceId - Instance identifier for seed generation
 * @param startIdx - First index to fill
 * @param endIdx - Last index (exclusive) to fill
 * @param basisKind - Generation algorithm
 */
export function fillPlacementBasis(
  buffers: PlacementBasisBuffers,
  instanceId: string,
  startIdx: number,
  endIdx: number,
  basisKind: BasisKind
): void {
  if (!buffers) throw new Error('fillPlacementBasis: buffers is required');
  if (!instanceId) throw new Error('fillPlacementBasis: instanceId is required');
  if (typeof startIdx !== 'number') throw new Error('fillPlacementBasis: startIdx is required number');
  if (typeof endIdx !== 'number') throw new Error('fillPlacementBasis: endIdx is required number');
  if (!basisKind) throw new Error('fillPlacementBasis: basisKind is required');

  for (let i = startIdx; i < endIdx; i++) {
    const [u, v] = generateUV(basisKind, i, instanceId);
    buffers.uv[i * 2 + 0] = u;
    buffers.uv[i * 2 + 1] = v;
    buffers.rank[i] = generateRank(i);
    buffers.seed[i] = generateSeed(instanceId, i);
  }
}

/**
 * Create or retrieve PlacementBasis buffers for an instance.
 * Buffers are pre-allocated to MAX_ELEMENTS and never resized.
 *
 * @param store - The placement basis store
 * @param instanceId - Instance identifier
 * @param count - Current element count (used for initial fill)
 * @param basisKind - Generation algorithm
 * @returns PlacementBasisBuffers (from store or newly created)
 */
export function ensurePlacementBasis(
  store: Map<string, PlacementBasisBuffers>,
  instanceId: string,
  count: number,
  basisKind: BasisKind
): PlacementBasisBuffers {
  if (!store) throw new Error('ensurePlacementBasis: store is required');
  if (!instanceId) throw new Error('ensurePlacementBasis: instanceId is required');
  if (typeof count !== 'number') throw new Error('ensurePlacementBasis: count is required number');
  if (!basisKind) throw new Error('ensurePlacementBasis: basisKind is required');

  const existing = store.get(instanceId);
  if (existing) {
    // Already have buffers for this instance - return as-is
    // (pre-allocated to MAX_ELEMENTS, no resize needed)
    return existing;
  }

  // Allocate new buffers (pre-allocated to MAX_ELEMENTS)
  const buffers: PlacementBasisBuffers = {
    uv: new Float32Array(MAX_ELEMENTS * 2),
    rank: new Float32Array(MAX_ELEMENTS),
    seed: new Float32Array(MAX_ELEMENTS),
    basisKind,
  };

  // Fill all slots up front (deterministic)
  fillPlacementBasis(buffers, instanceId, 0, MAX_ELEMENTS, basisKind);

  store.set(instanceId, buffers);
  return buffers;
}
