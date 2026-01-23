/**
 * 3D Layout Kernels
 *
 * These produce vec3 position fields (Float32Array, stride 3).
 * All layouts write z=0.0 explicitly unless z-modulation is provided.
 *
 * Kernels are pure functions: no state, no side effects, no allocations
 * beyond the output buffer (which is pre-allocated by the caller).
 *
 * Coord-space: All outputs are WORLD-SPACE [0,1]^2 for XY, with z in world units.
 */

/**
 * Grid layout: arrange N instances in a cols x rows grid.
 * Positions are in world-space [0,1]^2 with z=0.0.
 *
 * @param out - Pre-allocated Float32Array(N*3) to write positions into
 * @param N - Number of instances
 * @param cols - Number of columns
 * @param rows - Number of rows
 */
export function gridLayout3D(out: Float32Array, N: number, cols: number, rows: number): void {
  cols = Math.max(1, Math.round(cols));
  rows = Math.max(1, Math.round(rows));

  for (let i = 0; i < N; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const x = cols > 1 ? col / (cols - 1) : 0.5;
    const y = rows > 1 ? row / (rows - 1) : 0.5;
    out[i * 3 + 0] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = 0.0; // Explicit z=0
  }
}

/**
 * Line layout: arrange N instances along a line from (x0,y0) to (x1,y1).
 * Positions are in world-space with z=0.0.
 *
 * @param out - Pre-allocated Float32Array(N*3) to write positions into
 * @param N - Number of instances
 * @param x0 - Start X
 * @param y0 - Start Y
 * @param x1 - End X
 * @param y1 - End Y
 */
export function lineLayout3D(out: Float32Array, N: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let i = 0; i < N; i++) {
    const t = N > 1 ? i / (N - 1) : 0.5;
    out[i * 3 + 0] = (1 - t) * x0 + t * x1;
    out[i * 3 + 1] = (1 - t) * y0 + t * y1;
    out[i * 3 + 2] = 0.0; // Explicit z=0
  }
}

/**
 * Circle layout: arrange N instances in a circle centered at (cx, cy).
 * Positions are in world-space with z=0.0.
 *
 * @param out - Pre-allocated Float32Array(N*3) to write positions into
 * @param N - Number of instances
 * @param cx - Center X (world-space)
 * @param cy - Center Y (world-space)
 * @param radius - Circle radius (world-space)
 * @param phase - Phase offset [0,1] → full rotation
 */
export function circleLayout3D(
  out: Float32Array,
  N: number,
  cx: number,
  cy: number,
  radius: number,
  phase: number
): void {
  const TWO_PI = Math.PI * 2;

  for (let i = 0; i < N; i++) {
    const t = N > 0 ? i / N : 0;
    const angle = TWO_PI * (t + phase);
    out[i * 3 + 0] = cx + radius * Math.cos(angle);
    out[i * 3 + 1] = cy + radius * Math.sin(angle);
    out[i * 3 + 2] = 0.0; // Explicit z=0
  }
}

/**
 * Apply z-modulation to a position field.
 * Writes non-zero z values based on a modulation source.
 *
 * This is the mechanism for layout blocks to receive z-modulation input.
 * The modulation source is a Float32Array(N) of z values.
 *
 * @param positions - Position field (Float32Array, stride 3) to modify in-place
 * @param zModulation - Float32Array(N) of z values to write
 * @param N - Number of instances
 */
export function applyZModulation(positions: Float32Array, zModulation: Float32Array, N: number): void {
  for (let i = 0; i < N; i++) {
    positions[i * 3 + 2] = zModulation[i];
  }
}
