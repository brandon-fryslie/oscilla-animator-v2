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

const DEG_TO_RAD = Math.PI / 180;

/**
 * Default camera when no Camera block exists (spec §6.2).
 * Ortho identity view — flat, centered, no tilt.
 */
export const DEFAULT_CAMERA: Readonly<ResolvedCameraParams> = Object.freeze({
  projection: 'ortho' as const,
  centerX: 0.5,
  centerY: 0.5,
  distance: 2.0,
  tiltRad: 0,
  yawRad: 0,
  fovYRad: 45 * DEG_TO_RAD,
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
 * @param state - Runtime state with slot values populated by signal evaluation
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
  // Build slot→offset lookup (O(n) scan, acceptable for 9 lookups per frame)
  const readSlot = (slot: ValueSlot): number => {
    for (const meta of program.slotMeta) {
      if (meta.slot === slot) {
        return state.values.f64[meta.offset];
      }
    }
    return 0;
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
    tiltRad: tiltDeg * DEG_TO_RAD,
    yawRad: yawDeg * DEG_TO_RAD,
    fovYRad: fovYDeg * DEG_TO_RAD,
    near,
    far,
  };
}
