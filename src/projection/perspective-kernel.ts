/**
 * Perspective Projection Kernel (Pure Math)
 *
 * Maps world-space vec3 → screen-space (screenPos, depth, visible) using
 * perspective projection. Camera position is derived from (tiltAngle, yawAngle,
 * distance, camTarget) or provided directly.
 *
 * Same output shape as the ortho kernel: { screenX, screenY, depth, visible }.
 * screenPos is normalized to [0,1] (not pixels).
 *
 * Architectural rules:
 * - Pure function: no state, no side effects, no allocations, no runtime imports
 * - Camera params are explicit arguments
 * - Standalone module with zero imports from runtime/pipeline/assembler
 * - Operates directly on Float32Array buffers
 */

import type { ProjectionResult } from './ortho-kernel';

// =============================================================================
// Camera Params
// =============================================================================

/**
 * Perspective camera parameters.
 * ONE canonical const object — the single source of truth for defaults.
 */
export interface PerspectiveCameraParams {
  /** Camera position (world-space) */
  readonly camPosX: number;
  readonly camPosY: number;
  readonly camPosZ: number;
  /** Camera target (world-space) */
  readonly camTargetX: number;
  readonly camTargetY: number;
  readonly camTargetZ: number;
  /** Camera up vector */
  readonly camUpX: number;
  readonly camUpY: number;
  readonly camUpZ: number;
  /** Vertical field of view in radians */
  readonly fovY: number;
  /** Near clipping plane distance */
  readonly near: number;
  /** Far clipping plane distance */
  readonly far: number;
}

/**
 * Derive camera position from tilt/yaw/distance/target.
 *
 * Formula: camPos = camTarget + R_yaw(yawAngle) * R_tilt(tiltAngle) * (0, 0, distance)
 *
 * This is a separate pure function (not coupled to the projection kernel)
 * so Level 10.5 can provide camPos directly, bypassing this derivation.
 *
 * @param camTargetX - Target X
 * @param camTargetY - Target Y
 * @param camTargetZ - Target Z
 * @param tiltAngle - Tilt angle in radians (rotation around X axis)
 * @param yawAngle - Yaw angle in radians (rotation around Y axis)
 * @param distance - Distance from target
 * @returns [camPosX, camPosY, camPosZ]
 */
export function deriveCamPos(
  camTargetX: number,
  camTargetY: number,
  camTargetZ: number,
  tiltAngle: number,
  yawAngle: number,
  distance: number,
): [number, number, number] {
  // Start with (0, 0, distance) — pointing straight back along Z
  // Apply tilt (rotation around X): rotates Y/Z plane
  const cosTilt = Math.cos(tiltAngle);
  const sinTilt = Math.sin(tiltAngle);
  // After tilt: (0, distance*sinTilt, distance*cosTilt)
  const tiltedY = distance * sinTilt;
  const tiltedZ = distance * cosTilt;

  // Apply yaw (rotation around Y): rotates X/Z plane
  const cosYaw = Math.cos(yawAngle);
  const sinYaw = Math.sin(yawAngle);
  // After yaw: (tiltedZ*sinYaw, tiltedY, tiltedZ*cosYaw)
  const finalX = tiltedZ * sinYaw;
  const finalY = tiltedY;
  const finalZ = tiltedZ * cosYaw;

  return [
    camTargetX + finalX,
    camTargetY + finalY,
    camTargetZ + finalZ,
  ];
}

/**
 * THE canonical default perspective camera.
 * Derived from spec: tilt=35°, yaw=0°, distance=2.0, target=(0.5, 0.5, 0)
 */
const TILT_RAD = 35 * Math.PI / 180;
const YAW_RAD = 0;
const DISTANCE = 2.0;
const TARGET_X = 0.5;
const TARGET_Y = 0.5;
const TARGET_Z = 0.0;

const [defaultCamX, defaultCamY, defaultCamZ] = deriveCamPos(
  TARGET_X, TARGET_Y, TARGET_Z,
  TILT_RAD, YAW_RAD, DISTANCE
);

export const PERSP_CAMERA_DEFAULTS: PerspectiveCameraParams = Object.freeze({
  camPosX: defaultCamX,
  camPosY: defaultCamY,
  camPosZ: defaultCamZ,
  camTargetX: TARGET_X,
  camTargetY: TARGET_Y,
  camTargetZ: TARGET_Z,
  camUpX: 0.0,
  camUpY: 1.0,
  camUpZ: 0.0,
  fovY: 45 * Math.PI / 180,
  near: 0.01,
  far: 100.0,
});

// Re-export for tests that need to verify the derivation
export const PERSP_DERIVATION = Object.freeze({
  tiltAngle: TILT_RAD,
  yawAngle: YAW_RAD,
  distance: DISTANCE,
  camTargetX: TARGET_X,
  camTargetY: TARGET_Y,
  camTargetZ: TARGET_Z,
});

// =============================================================================
// View Basis (shared helper for lookAt computation)
// =============================================================================

/**
 * Compute view-space basis vectors from camera parameters.
 * Returns forward (Z), right (X), up (Y) vectors.
 *
 * This is a shared helper — the ortho kernel can use it too for depth computation.
 */
function computeViewBasis(
  camPosX: number, camPosY: number, camPosZ: number,
  camTargetX: number, camTargetY: number, camTargetZ: number,
  camUpX: number, camUpY: number, camUpZ: number,
): {
  forwardX: number; forwardY: number; forwardZ: number;
  rightX: number; rightY: number; rightZ: number;
  upX: number; upY: number; upZ: number;
} {
  // Forward = normalize(target - camPos)
  let fwdX = camTargetX - camPosX;
  let fwdY = camTargetY - camPosY;
  let fwdZ = camTargetZ - camPosZ;
  const fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
  fwdX /= fwdLen;
  fwdY /= fwdLen;
  fwdZ /= fwdLen;

  // Right = normalize(forward × camUp)
  let rightX = fwdY * camUpZ - fwdZ * camUpY;
  let rightY = fwdZ * camUpX - fwdX * camUpZ;
  let rightZ = fwdX * camUpY - fwdY * camUpX;
  const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
  rightX /= rightLen;
  rightY /= rightLen;
  rightZ /= rightLen;

  // Up = right × forward (guaranteed orthogonal)
  const upXv = rightY * fwdZ - rightZ * fwdY;
  const upYv = rightZ * fwdX - rightX * fwdZ;
  const upZv = rightX * fwdY - rightY * fwdX;

  return {
    forwardX: fwdX, forwardY: fwdY, forwardZ: fwdZ,
    rightX, rightY, rightZ,
    upX: upXv, upY: upYv, upZ: upZv,
  };
}

// =============================================================================
// Scalar Kernel
// =============================================================================

/**
 * Project a single world-space point to screen-space using perspective projection.
 *
 * Output: screenPos in [0,1], depth in [0,1], visible boolean.
 *
 * @param worldX - World-space X
 * @param worldY - World-space Y
 * @param worldZ - World-space Z
 * @param camera - Perspective camera parameters
 * @param out - Pre-allocated output object
 */
export function projectWorldToScreenPerspective(
  worldX: number,
  worldY: number,
  worldZ: number,
  camera: PerspectiveCameraParams,
  out: ProjectionResult,
): ProjectionResult {
  const basis = computeViewBasis(
    camera.camPosX, camera.camPosY, camera.camPosZ,
    camera.camTargetX, camera.camTargetY, camera.camTargetZ,
    camera.camUpX, camera.camUpY, camera.camUpZ,
  );

  // Transform to view-space (camera at origin, looking along +Z)
  const dx = worldX - camera.camPosX;
  const dy = worldY - camera.camPosY;
  const dz = worldZ - camera.camPosZ;

  // View-space coordinates: project onto basis vectors
  const viewX = dx * basis.rightX + dy * basis.rightY + dz * basis.rightZ;
  const viewY = dx * basis.upX + dy * basis.upY + dz * basis.upZ;
  const viewZ = dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;

  // Check if behind camera (viewZ <= 0 means behind or at camera)
  if (viewZ <= 0) {
    out.screenX = 0;
    out.screenY = 0;
    out.depth = 0;
    out.visible = false;
    return out;
  }

  // Perspective divide
  const tanHalfFov = Math.tan(camera.fovY * 0.5);
  // Assuming aspect ratio = 1 (square viewport in normalized coords)
  const projX = viewX / (viewZ * tanHalfFov);
  const projY = viewY / (viewZ * tanHalfFov);

  // Map from [-1,1] clip space to [0,1] normalized screen space
  out.screenX = projX * 0.5 + 0.5;
  out.screenY = projY * 0.5 + 0.5;

  // Depth: linear map of viewZ from [near, far] → [0, 1]
  const range = camera.far - camera.near;
  out.depth = (viewZ - camera.near) / range;

  // Visibility: within near/far planes and in front of camera
  out.visible = viewZ >= camera.near && viewZ <= camera.far;

  return out;
}

// =============================================================================
// Field Kernel
// =============================================================================

/**
 * Project an entire position field using perspective projection.
 *
 * Same output format as projectFieldOrtho for seamless mode switching.
 *
 * @param worldPositions - Input: Float32Array(N*3)
 * @param N - Number of instances
 * @param camera - Perspective camera parameters
 * @param outScreenPos - Output: Float32Array(N*2)
 * @param outDepth - Output: Float32Array(N)
 * @param outVisible - Output: Uint8Array(N)
 */
export function projectFieldPerspective(
  worldPositions: Float32Array,
  N: number,
  camera: PerspectiveCameraParams,
  outScreenPos: Float32Array,
  outDepth: Float32Array,
  outVisible: Uint8Array,
): void {
  // Pre-compute view basis (once for all instances)
  const basis = computeViewBasis(
    camera.camPosX, camera.camPosY, camera.camPosZ,
    camera.camTargetX, camera.camTargetY, camera.camTargetZ,
    camera.camUpX, camera.camUpY, camera.camUpZ,
  );

  const tanHalfFov = Math.tan(camera.fovY * 0.5);
  const range = camera.far - camera.near;
  const near = camera.near;
  const far = camera.far;

  for (let i = 0; i < N; i++) {
    const worldX = worldPositions[i * 3 + 0];
    const worldY = worldPositions[i * 3 + 1];
    const worldZ = worldPositions[i * 3 + 2];

    // World → view-space
    const dx = worldX - camera.camPosX;
    const dy = worldY - camera.camPosY;
    const dz = worldZ - camera.camPosZ;

    const viewX = dx * basis.rightX + dy * basis.rightY + dz * basis.rightZ;
    const viewY = dx * basis.upX + dy * basis.upY + dz * basis.upZ;
    const viewZ = dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;

    if (viewZ <= 0) {
      outScreenPos[i * 2 + 0] = 0;
      outScreenPos[i * 2 + 1] = 0;
      outDepth[i] = 0;
      outVisible[i] = 0;
      continue;
    }

    // Perspective divide + map to [0,1]
    const invViewZ = 1.0 / (viewZ * tanHalfFov);
    outScreenPos[i * 2 + 0] = viewX * invViewZ * 0.5 + 0.5;
    outScreenPos[i * 2 + 1] = viewY * invViewZ * 0.5 + 0.5;

    // Depth: linear [near, far] → [0, 1]
    outDepth[i] = (viewZ - near) / range;

    // Visibility
    outVisible[i] = (viewZ >= near && viewZ <= far) ? 1 : 0;
  }
}

// =============================================================================
// Size Projection (Perspective)
// =============================================================================

/**
 * Project a world-space radius to screen-space radius under perspective projection.
 *
 * Under perspective, apparent size shrinks with distance from camera (1/viewZ falloff).
 * The formula: screenRadius = worldRadius / (viewZ * tanHalfFov)
 * This is the same factor used in the perspective divide for positions.
 *
 * @param worldRadius - World-space radius
 * @param worldX - World X (needed for view-space distance computation)
 * @param worldY - World Y
 * @param worldZ - World Z
 * @param camera - Perspective camera parameters
 * @returns Screen-space radius (foreshortened by distance)
 */
export function projectWorldRadiusToScreenRadiusPerspective(
  worldRadius: number,
  worldX: number,
  worldY: number,
  worldZ: number,
  camera: PerspectiveCameraParams,
): number {
  if (worldRadius === 0) return 0;

  const basis = computeViewBasis(
    camera.camPosX, camera.camPosY, camera.camPosZ,
    camera.camTargetX, camera.camTargetY, camera.camTargetZ,
    camera.camUpX, camera.camUpY, camera.camUpZ,
  );

  // Compute view-space Z (distance along view axis)
  const dx = worldX - camera.camPosX;
  const dy = worldY - camera.camPosY;
  const dz = worldZ - camera.camPosZ;
  const viewZ = dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;

  if (viewZ <= 0) return 0;

  // Same perspective scaling as position projection
  const tanHalfFov = Math.tan(camera.fovY * 0.5);
  return worldRadius / (viewZ * tanHalfFov);
}

/**
 * Project a field of world-space radii to screen-space under perspective.
 * Foreshortening: farther instances have smaller screen radii.
 *
 * @param worldRadii - Input: Float32Array(N) world-space radii
 * @param worldPositions - Input: Float32Array(N*3) world positions
 * @param N - Number of instances
 * @param camera - Perspective camera params
 * @param outScreenRadii - Output: Float32Array(N) screen-space radii
 */
export function projectFieldRadiusPerspective(
  worldRadii: Float32Array,
  worldPositions: Float32Array,
  N: number,
  camera: PerspectiveCameraParams,
  outScreenRadii: Float32Array,
): void {
  const basis = computeViewBasis(
    camera.camPosX, camera.camPosY, camera.camPosZ,
    camera.camTargetX, camera.camTargetY, camera.camTargetZ,
    camera.camUpX, camera.camUpY, camera.camUpZ,
  );

  const tanHalfFov = Math.tan(camera.fovY * 0.5);

  for (let i = 0; i < N; i++) {
    const worldRadius = worldRadii[i];
    if (worldRadius === 0) {
      outScreenRadii[i] = 0;
      continue;
    }

    const dx = worldPositions[i * 3 + 0] - camera.camPosX;
    const dy = worldPositions[i * 3 + 1] - camera.camPosY;
    const dz = worldPositions[i * 3 + 2] - camera.camPosZ;
    const viewZ = dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;

    if (viewZ <= 0) {
      outScreenRadii[i] = 0;
      continue;
    }

    outScreenRadii[i] = worldRadius / (viewZ * tanHalfFov);
  }
}
