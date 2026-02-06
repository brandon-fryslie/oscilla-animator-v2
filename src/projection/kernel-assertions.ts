/**
 * Buffer size assertions for projection kernels.
 *
 * These validate that output buffers have the correct minimum length
 * before kernels write into them. Since arena-allocated buffers are
 * contiguous subarrays, an undersized buffer means the kernel would
 * write past its allocation into a neighboring buffer's memory.
 *
 * Assertions are cheap (a few comparisons) relative to the kernel work,
 * and they convert silent corruption into loud, immediate failure.
 */

/**
 * Assert that field projection buffers have correct sizes for N instances.
 *
 * Expected sizes:
 * - worldPositions: N*3 (vec3 input)
 * - outScreenPos: N*2 (vec2 output)
 * - outDepth: N (scalar output)
 * - outVisible: N (scalar output)
 */
export function assertFieldBufferSizes(
  worldPositions: Float32Array,
  N: number,
  outScreenPos: Float32Array,
  outDepth: Float32Array,
  outVisible: Uint8Array,
): void {
  if (worldPositions.length < N * 3) {
    throw new Error(
      `Projection kernel: worldPositions buffer too small (${worldPositions.length} < ${N * 3} required for ${N} instances)`,
    );
  }
  if (outScreenPos.length < N * 2) {
    throw new Error(
      `Projection kernel: outScreenPos buffer too small (${outScreenPos.length} < ${N * 2} required for ${N} instances)`,
    );
  }
  if (outDepth.length < N) {
    throw new Error(
      `Projection kernel: outDepth buffer too small (${outDepth.length} < ${N} required for ${N} instances)`,
    );
  }
  if (outVisible.length < N) {
    throw new Error(
      `Projection kernel: outVisible buffer too small (${outVisible.length} < ${N} required for ${N} instances)`,
    );
  }
}

/**
 * Assert that radius projection buffers have correct sizes for N instances.
 *
 * Expected sizes:
 * - worldRadii: N (scalar input)
 * - outScreenRadii: N (scalar output)
 */
export function assertRadiusBufferSizes(
  worldRadii: Float32Array,
  N: number,
  outScreenRadii: Float32Array,
): void {
  if (worldRadii.length < N) {
    throw new Error(
      `Projection kernel: worldRadii buffer too small (${worldRadii.length} < ${N} required for ${N} instances)`,
    );
  }
  if (outScreenRadii.length < N) {
    throw new Error(
      `Projection kernel: outScreenRadii buffer too small (${outScreenRadii.length} < ${N} required for ${N} instances)`,
    );
  }
}
