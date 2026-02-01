/**
 * 3D Layout Kernels
 *
 * Most layout kernels (lineLayout3D, circleLayout3D, applyZModulation) have
 * been removed. Layout is now handled by field kernels (circleLayoutUV,
 * lineLayoutUV, gridLayoutUV) in FieldKernels.ts.
 *
 * gridLayout3D is retained as a test utility — it is only imported by
 * projection test files for populating position fields.
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
