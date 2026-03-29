/**
 * Camera Resolver — Frame Globals Resolution
 *
 * Reads camera parameter slots from program.renderGlobals and applies
 * deterministic sanitization to produce ResolvedCameraParams.
 *
 * Spec Reference: design-docs/_new/3d/camera-v2/01-basics.md §5
 */

import type { CompiledProgramIR, CameraDeclIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { RuntimeState } from './RuntimeState';
import type { CameraInputContract } from '../render/types';
import { getExprAddressTable } from './ExprAddressTable';
import {
  CANONICAL_WORLD_CENTER_X,
  CANONICAL_WORLD_CENTER_Y,
  DEGREES_TO_RADIANS,
} from '../core/coordinate-system';

// =============================================================================
// ResolvedCameraParams — The output contract
// =============================================================================

export interface ResolvedCameraParams {
  readonly projection: 'ortho' | 'persp';
  readonly centerX: number;   // [0, 1]
  readonly centerY: number;   // [0, 1]
  readonly distance: number;  // > 0
  readonly tiltRad: number;   // radians, clamped
  readonly yawRad: number;    // radians, wrapped
  readonly fovYRad: number;   // radians, clamped
  readonly near: number;      // > 0
  readonly far: number;       // > near
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default camera when no Camera block exists (spec §6.2).
 * Ortho identity view — flat, centered, no tilt.
 */
export const DEFAULT_CAMERA: Readonly<ResolvedCameraParams> = Object.freeze({
  projection: 'ortho' as const,
  centerX: CANONICAL_WORLD_CENTER_X,
  centerY: CANONICAL_WORLD_CENTER_Y,
  distance: 2.0,
  tiltRad: 0,
  yawRad: 0,
  fovYRad: 45 * DEGREES_TO_RADIANS,
  near: 0.01,
  far: 100,
});

/**
 * Momentary 3D preview camera (Shift key or toolbar toggle).
 *
 * Hardcoded perspective defaults that provide a useful 3D overview without
 * requiring a Camera block. MUST NOT affect compilation, state, or continuity —
 * this is an ephemeral visualization-only override.
 */
export const PREVIEW_CAMERA: Readonly<ResolvedCameraParams> = Object.freeze({
  projection: 'persp' as const,
  centerX: CANONICAL_WORLD_CENTER_X,
  centerY: CANONICAL_WORLD_CENTER_Y,
  distance: 0.87,
  tiltRad: 35 * DEGREES_TO_RADIANS,
  yawRad: 0,
  fovYRad: 60 * DEGREES_TO_RADIANS,
  near: 0.01,
  far: 100,
});

// =============================================================================
// Sanitization helpers (deterministic, no ambiguity)
// =============================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function wrapDegrees(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Replace NaN/Inf with fallback */
function sanitize(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

// =============================================================================
// Resolver
// =============================================================================

/**
 * Resolve camera parameters from program render globals.
 *
 * Called after schedule execution (all evalValue steps done), before render assembly.
 * Reads slot values, applies sanitization, returns ResolvedCameraParams.
 *
 * @param program - Compiled program with renderGlobals
 * @param state - Runtime state with slot values populated by scalar evaluation
 */
export function resolveCameraFromGlobals(
  program: CompiledProgramIR,
  state: RuntimeState,
): ResolvedCameraParams {
  if (program.renderGlobals.length === 0) {
    return DEFAULT_CAMERA;
  }

  const decl = program.renderGlobals[0];
  if (decl.kind !== 'camera') {
    return DEFAULT_CAMERA;
  }

  return resolveCameraDecl(decl, program, state);
}

/**
 * Resolve a single CameraDeclIR to ResolvedCameraParams.
 * Exported for testing.
 */
export function resolveCameraDecl(
  decl: CameraDeclIR,
  program: CompiledProgramIR,
  state: RuntimeState,
): ResolvedCameraParams {
  // [LAW:one-source-of-truth] Read camera slots through the canonical slotToArena table
  // rather than directly indexing program.arenaLayout in consumers.
  const slotToArena = getExprAddressTable(program).slotToArena;

  // Camera params are numeric value slots and should always be arena-backed.
  const readSlot = (slot: ValueSlot): number => {
    const desc = slotToArena.get(slot);
    if (!desc || desc.offset < 0) {
      // [LAW:no-silent-fallbacks] Missing camera slot bindings must fail fast
      // instead of silently producing fallback camera values.
      throw new Error(`CameraResolver: missing arena descriptor for camera slot ${slot}`);
    }
    return state.arena[desc.offset];
  };

  // Read raw values with NaN/Inf fallbacks to spec defaults
  const projRaw = sanitize(readSlot(decl.projectionSlot), 0);
  const centerXRaw = sanitize(readSlot(decl.centerXSlot), 0.5);
  const centerYRaw = sanitize(readSlot(decl.centerYSlot), 0.5);
  const distanceRaw = sanitize(readSlot(decl.distanceSlot), 2.0);
  const tiltDegRaw = sanitize(readSlot(decl.tiltDegSlot), 0);
  const yawDegRaw = sanitize(readSlot(decl.yawDegSlot), 0);
  const fovYDegRaw = sanitize(readSlot(decl.fovYDegSlot), 45);
  const nearRaw = sanitize(readSlot(decl.nearSlot), 0.01);
  const farRaw = sanitize(readSlot(decl.farSlot), 100);

  // Apply deterministic sanitization rules (spec §5.2)
  const projI32 = (projRaw | 0);
  const projection: 'ortho' | 'persp' = projI32 === 1 ? 'persp' : 'ortho';
  const centerX = clamp01(centerXRaw);
  const centerY = clamp01(centerYRaw);
  const distance = Math.max(distanceRaw, 0.0001);
  const tiltDeg = clamp(tiltDegRaw, -89.9, 89.9);
  const yawDeg = wrapDegrees(yawDegRaw);
  const fovYDeg = clamp(fovYDegRaw, 1.0, 179.0);
  const near = Math.max(nearRaw, 0.000001);
  const far = Math.max(farRaw, near + 0.000001);

  return {
    projection,
    centerX,
    centerY,
    distance,
    tiltRad: tiltDeg * DEGREES_TO_RADIANS,
    yawRad: yawDeg * DEGREES_TO_RADIANS,
    fovYRad: fovYDeg * DEGREES_TO_RADIANS,
    near,
    far,
  };
}

// =============================================================================
// Shared-memory bridge
// =============================================================================

/**
 * Convert ResolvedCameraParams to the CameraInputContract shape for
 * shared-memory publication to the Rust renderer worker.
 *
 * [LAW:one-source-of-truth] This is the single bridge between the
 * domain-typed camera resolver and the flat numeric shared buffer.
 */
export function cameraParamsToInputContract(params: ResolvedCameraParams): CameraInputContract {
  return {
    cameraProjection: params.projection === 'persp' ? 1 : 0,
    cameraCenterX: params.centerX,
    cameraCenterY: params.centerY,
    cameraDistance: params.distance,
    cameraTiltRad: params.tiltRad,
    cameraYawRad: params.yawRad,
    cameraFovYRad: params.fovYRad,
    cameraNear: params.near,
    cameraFar: params.far,
  };
}

/**
 * Default camera input contract values for shared memory.
 * Used when no Camera block exists or program is not compiled.
 */
export const DEFAULT_CAMERA_INPUT: Readonly<CameraInputContract> =
  Object.freeze(cameraParamsToInputContract(DEFAULT_CAMERA));
