/**
 * WASM Renderer Boundary Contract
 *
 * [LAW:one-source-of-truth] This module is the canonical authority for the
 * payload shapes that cross the JS→Rust boundaries:
 *
 * 1. NagaModuleIR → Naga shim (Rust) → WGSL
 * 2. RustRendererGpuPass[] → Renderer worker (Rust) → GPU pipelines
 *
 * The payload tester exercises boundary (1): NagaModuleIR is the input,
 * WGSL is an intermediate artifact produced by Rust, and the renderer
 * consumes it. JS never writes WGSL directly.
 */

// Re-export canonical types from their authoritative modules.
export type { RustRendererGpuPass } from './worker-protocol';
export type {
  RustRendererRebuildGpuPipelinesSuccess,
  RustRendererRebuildGpuPipelinesFailure,
} from './worker-protocol';
export { type GpuPassStage, isGpuPassStage } from '../../types/gpu-pass-stage';
export type {
  MemoryManifestIR,
  MemoryResourceIR,
  MemoryResourceKind,
  Texture2DFormat,
} from '../../compiler/ir/program';
export type { NagaModuleIR } from '../../compiler/ir/naga-emitter/ScheduleNagaLowering';

/**
 * Validate a hand-authored NagaModuleIR JSON payload.
 *
 * Checks structural correctness (required top-level fields exist and are arrays).
 * Does NOT validate expression/statement semantics — that's the Naga shim's job.
 */
export function validateNagaModulePayload(
  json: unknown
): { valid: true } | { valid: false; errors: string[] } {
  if (json === null || typeof json !== 'object') {
    return { valid: false, errors: ['Payload must be a JSON object'] };
  }

  const obj = json as Record<string, unknown>;
  const errors: string[] = [];

  if (!Array.isArray(obj.types)) {
    errors.push('Missing or invalid "types" array');
  }
  if (!Array.isArray(obj.constants)) {
    errors.push('Missing or invalid "constants" array');
  }
  if (!Array.isArray(obj.global_variables)) {
    errors.push('Missing or invalid "global_variables" array');
  }
  if (!Array.isArray(obj.functions)) {
    errors.push('Missing or invalid "functions" array');
  }
  if (!Array.isArray(obj.entry_points)) {
    errors.push('Missing or invalid "entry_points" array');
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
