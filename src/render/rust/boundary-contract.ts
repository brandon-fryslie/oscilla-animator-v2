/**
 * WASM Renderer Boundary Contract
 *
 * [LAW:one-source-of-truth] This module is the canonical authority for the
 * payload shape that crosses the JS→Rust WASM renderer boundary during
 * pipeline rebuild. All consumers (compiler backend, payload tester, tests)
 * import from here.
 *
 * The Rust side deserializes these types via serde in parse_gpu_pass_specs()
 * (oscilla-rust-renderer/src/lib.rs). Any changes here must be mirrored in
 * the Rust deserialization logic.
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

/**
 * Validate a hand-authored JSON payload before submission to the renderer.
 *
 * This checks structural correctness (required fields, correct types) but
 * does NOT validate WGSL syntax or memory manifest semantics — those are
 * enforced by the Rust side during pipeline compilation.
 */
export function validateRawPayload(
  json: unknown
): { valid: true; passes: import('./worker-protocol').RustRendererGpuPass[] } | { valid: false; errors: string[] } {
  if (!Array.isArray(json)) {
    return { valid: false, errors: ['Payload must be a JSON array of pass objects'] };
  }

  const errors: string[] = [];
  const passes: import('./worker-protocol').RustRendererGpuPass[] = [];

  for (let i = 0; i < json.length; i++) {
    const item = json[i];
    const prefix = `passes[${i}]`;

    if (item === null || typeof item !== 'object') {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    const obj = item as Record<string, unknown>;

    if (typeof obj.passId !== 'string' || obj.passId.length === 0) {
      errors.push(`${prefix}.passId: must be a non-empty string`);
    }

    if (typeof obj.stage !== 'string') {
      errors.push(`${prefix}.stage: must be a string`);
    } else if (obj.stage !== 'compute') {
      // Currently the only supported stage. The Rust side's parse_gpu_pass_specs
      // matches on stage.as_str() and only handles "compute".
      errors.push(`${prefix}.stage: unsupported stage "${obj.stage}" (only "compute" is currently supported)`);
    }

    if (typeof obj.entryPoint !== 'string' || obj.entryPoint.length === 0) {
      errors.push(`${prefix}.entryPoint: must be a non-empty string`);
    }

    if (typeof obj.wgsl !== 'string' || obj.wgsl.length === 0) {
      errors.push(`${prefix}.wgsl: must be a non-empty string`);
    }

    // memoryManifest is optional — no validation here (Rust handles it)

    if (errors.length === 0) {
      passes.push(obj as unknown as import('./worker-protocol').RustRendererGpuPass);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, passes };
}
