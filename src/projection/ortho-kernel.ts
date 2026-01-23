/**
 * Orthographic Projection Kernel (Pure Math)
 *
 * Maps world-space vec3 → screen-space (screenPos, depth, visible).
 * Under orthographic projection with default camera:
 *   screenPos.xy === worldPos.xy (identity for z=0 plane)
 *   depth is derived from z (monotonically increasing with z)
 *   visible = near <= z <= far
 *
 * Architectural rules:
 * - Pure function: no state, no side effects, no allocations, no runtime imports
 * - Camera params are explicit arguments (never read from a global)
 * - Returns full struct { screenPos, depth, visible } (not just screenPos)
 * - Standalone module with zero imports from runtime/pipeline/assembler
 * - Operates directly on Float32Array buffers (no object conversion)
 */

// =============================================================================
// Camera Params
// =============================================================================

/**
 * Orthographic camera parameters.
 * ONE canonical const object — the single source of truth for defaults.
 */
export interface OrthoCameraParams {
  /** Near clipping plane (z values below this are invisible) */
  readonly near: number;
  /** Far clipping plane (z values above this are invisible) */
  readonly far: number;
}

/**
 * THE canonical default orthographic camera.
 * There is ONE definition. Level 6 swaps between this and PERSP_CAMERA_DEFAULTS.
 */
export const ORTHO_CAMERA_DEFAULTS: OrthoCameraParams = Object.freeze({
  near: -100.0,
  far: 100.0,
});

// =============================================================================
// Scalar Kernel
// =============================================================================

/**
 * Result of projecting a single world-space point.
 */
export interface ProjectionResult {
  screenX: number;
  screenY: number;
  depth: number;
  visible: boolean;
}

/**
 * Project a single world-space point to screen-space using orthographic projection.
 *
 * Identity property: for z=0, screenPos === worldPos.xy
 * Depth: linearly mapped from [near, far] to [0, 1] (monotonically increasing with z)
 * Visible: true iff near <= z <= far
 *
 * This function is allocation-free: it writes into a pre-existing result object
 * passed by the caller (or uses the module-level scratch object for convenience).
 *
 * @param worldX - World-space X coordinate
 * @param worldY - World-space Y coordinate
 * @param worldZ - World-space Z coordinate
 * @param camera - Orthographic camera parameters
 * @param out - Pre-allocated output object to write into
 */
export function projectWorldToScreenOrtho(
  worldX: number,
  worldY: number,
  worldZ: number,
  camera: OrthoCameraParams,
  out: ProjectionResult,
): ProjectionResult {
  // Ortho identity: screen XY === world XY (regardless of z)
  out.screenX = worldX;
  out.screenY = worldY;

  // Depth: linear map from [near, far] → [0, 1]
  // Monotonically increasing with z
  const range = camera.far - camera.near;
  out.depth = (worldZ - camera.near) / range;

  // Visibility: within near/far planes
  out.visible = worldZ >= camera.near && worldZ <= camera.far;

  return out;
}

// =============================================================================
// Field Kernel
// =============================================================================

/**
 * Project an entire position field (Float32Array stride 3) to screen-space.
 *
 * Outputs:
 * - screenPos: Float32Array(N*2) — screen-space XY
 * - depth: Float32Array(N) — normalized depth [0,1]
 * - visible: Uint8Array(N) — 1 if visible, 0 if culled
 *
 * This operates directly on the Float32Array buffers from Level 1.
 * No object conversion, no allocations beyond the output buffers (which
 * must be pre-allocated by the caller).
 *
 * @param worldPositions - Input: Float32Array(N*3) world-space positions
 * @param N - Number of instances
 * @param camera - Orthographic camera parameters
 * @param outScreenPos - Output: Float32Array(N*2) to write screen positions into
 * @param outDepth - Output: Float32Array(N) to write depth values into
 * @param outVisible - Output: Uint8Array(N) to write visibility flags into
 */
export function projectFieldOrtho(
  worldPositions: Float32Array,
  N: number,
  camera: OrthoCameraParams,
  outScreenPos: Float32Array,
  outDepth: Float32Array,
  outVisible: Uint8Array,
): void {
  const range = camera.far - camera.near;
  const near = camera.near;
  const far = camera.far;

  for (let i = 0; i < N; i++) {
    const worldX = worldPositions[i * 3 + 0];
    const worldY = worldPositions[i * 3 + 1];
    const worldZ = worldPositions[i * 3 + 2];

    // Ortho identity: screen XY === world XY
    outScreenPos[i * 2 + 0] = worldX;
    outScreenPos[i * 2 + 1] = worldY;

    // Depth: linear map [near, far] → [0, 1]
    // Uses division (not multiply-by-reciprocal) to match scalar kernel exactly
    outDepth[i] = (worldZ - near) / range;

    // Visibility: within frustum
    outVisible[i] = (worldZ >= near && worldZ <= far) ? 1 : 0;
  }
}
