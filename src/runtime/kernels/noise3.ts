/**
 * ══════════════════════════════════════════════════════════════════════
 * NOISE3 - 3D Simplex Noise Kernel
 * ══════════════════════════════════════════════════════════════════════
 *
 * 3D Simplex noise implementation for procedural generation.
 * Delegates to simplex-noise (Mapbox) for robust, battle-tested noise.
 *
 * Properties:
 * - Deterministic: same (x, y, z, seed) → same output, always
 * - Pure: no internal state, no side effects
 * - Range: approximately [-1, 1]
 * - Smooth: spatially coherent (nearby inputs produce nearby outputs)
 *
 * Signature: noise3(px, py, pz, seed) → scalar
 * - px, py, pz: 3D position coordinates (unbounded)
 * - seed: random seed (controls spatial offset into noise field)
 * - Returns: scalar value in approximately [-1, 1]
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import { createNoise3D } from 'simplex-noise';
import type { ScalarKernel } from '../KernelRegistry';

/**
 * Mulberry32 PRNG for deterministic permutation table construction.
 * Returns values in [0, 1). Used only once at module load to build
 * the noise field — not in the hot loop.
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Single noise3D instance with deterministic permutation table.
 * Seed variation is achieved by offsetting coordinates (same approach
 * as the original — different seed values sample different regions
 * of the same noise field).
 */
const noise3D = createNoise3D(mulberry32(0));

/**
 * 3D Simplex noise kernel
 */
export const noise3: ScalarKernel = (args: number[]): number => {
  const [px, py, pz, seed] = args;

  // Apply seed offset to coordinates — different seeds sample
  // different regions of the noise field, producing distinct patterns.
  const seedHash = Math.floor(seed * 73856093) % 256;
  const x = px + seedHash * 137.0;
  const y = py + seedHash * 241.0;
  const z = pz + seedHash * 293.0;

  return noise3D(x, y, z);
};
