/**
 * ══════════════════════════════════════════════════════════════════════
 * NOISE3 - 3D Simplex Noise Kernel
 * ══════════════════════════════════════════════════════════════════════
 *
 * 3D Simplex noise implementation for procedural generation.
 *
 * Properties:
 * - Deterministic: same (x, y, z, seed) → same output, always
 * - Pure: no internal state, no side effects
 * - Range: approximately [-1, 1] (not exact bounds, but typical output)
 * - Smooth: spatially coherent (nearby inputs produce nearby outputs)
 *
 * Signature: noise3(px, py, pz, seed) → scalar
 * - px, py, pz: 3D position coordinates (unbounded)
 * - seed: random seed (controls permutation table)
 * - Returns: scalar value in approximately [-1, 1]
 *
 * Implementation based on Stefan Gustavson's simplex noise (public domain).
 * Ref: https://weber.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { ScalarKernel } from '../KernelRegistry';

/**
 * 3D Simplex noise kernel
 */
export const noise3: ScalarKernel = (args: number[]): number => {
  const [px, py, pz, seed] = args;

  // Apply seed offset to coordinates (simple and effective)
  const seedHash = Math.floor(seed * 73856093) % 256;
  const x = px + seedHash * 137.0;
  const y = py + seedHash * 241.0;
  const z = pz + seedHash * 293.0;

  // Skewing and unskewing factors for 3D
  const F3 = 1.0 / 3.0;
  const G3 = 1.0 / 6.0;

  // Skew the input space to determine which simplex cell we're in
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  const X0 = i - t; // Unskew the cell origin back to (x,y,z) space
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = x - X0; // The x,y,z distances from the cell origin
  const y0 = y - Y0;
  const z0 = z - Z0;

  // Determine which simplex we are in
  let i1, j1, k1; // Offsets for second corner of simplex
  let i2, j2, k2; // Offsets for third corner of simplex

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else {
    if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    }
  }

  // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
  // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
  // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
  // c = 1/6.

  const x1 = x0 - i1 + G3; // Offsets for second corner
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3; // Offsets for fourth corner
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;

  // Work out the hashed gradient indices of the four simplex corners
  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  const gi0 = perm[(ii + perm[(jj + perm[kk]) & 511]) & 511] % 12;
  const gi1 = perm[(ii + i1 + perm[(jj + j1 + perm[kk + k1]) & 511]) & 511] % 12;
  const gi2 = perm[(ii + i2 + perm[(jj + j2 + perm[kk + k2]) & 511]) & 511] % 12;
  const gi3 = perm[(ii + 1 + perm[(jj + 1 + perm[kk + 1]) & 511]) & 511] % 12;

  // Calculate the contribution from the four corners
  let n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 >= 0) {
    t0 *= t0;
    n0 = t0 * t0 * dot(grad3[gi0], x0, y0, z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 >= 0) {
    t1 *= t1;
    n1 = t1 * t1 * dot(grad3[gi1], x1, y1, z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 >= 0) {
    t2 *= t2;
    n2 = t2 * t2 * dot(grad3[gi2], x2, y2, z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 >= 0) {
    t3 *= t3;
    n3 = t3 * t3 * dot(grad3[gi3], x3, y3, z3);
  }

  // Add contributions from each corner to get the final noise value.
  // The result is scaled to return values in the interval [-1,1].
  return 32.0 * (n0 + n1 + n2 + n3);
};

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Gradient vectors for 3D noise (pointing to the mid points of 12 edges of a cube)
 */
const grad3: readonly [number, number, number][] = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
];

/**
 * Permutation table (256 values, repeated twice for overflow wrapping)
 */
const permutation: readonly number[] = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
  35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
  55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
  250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
  189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
  172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
  228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
  107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
];

/**
 * Doubled permutation table for overflow wrapping
 */
const perm: readonly number[] = [
  ...permutation,
  ...permutation
];

/**
 * Dot product for gradient vectors
 */
function dot(g: readonly [number, number, number], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}
