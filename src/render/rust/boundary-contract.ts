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
import type { RustRendererGpuPass as _RustRendererGpuPass } from './worker-protocol';
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
    const preItemErrorCount = errors.length;

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

    if (errors.length === preItemErrorCount) {
      passes.push(obj as unknown as import('./worker-protocol').RustRendererGpuPass);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, passes };
}

// =============================================================================
// Install Pipeline Boundary
// =============================================================================

export interface InstallPipelineBoundaryPayloadV1 {
  readonly type: 'INSTALL_PIPELINE_V1';
  readonly pipeline: {
    readonly passes: readonly _RustRendererGpuPass[];
    readonly sinkPointerMap: Readonly<Record<string, string>>;
    readonly shapeBankWords: readonly number[] | Uint32Array;
    readonly shapeBankWordCount: number;
    readonly topologyIdByHandle: readonly number[] | Uint32Array;
    readonly sinkTableWords: readonly number[] | Uint32Array;
    readonly sinkTableWordCount: number;
  };
}

export interface NormalizedInstallPipelinePayloadV1 {
  readonly pipeline: {
    readonly passes: readonly _RustRendererGpuPass[];
    readonly sinkPointerMap: Readonly<Record<string, string>>;
    readonly shapeBankWords: Uint32Array;
    readonly shapeBankWordCount: number;
    readonly topologyIdByHandle: Uint32Array;
    readonly sinkTableWords: Uint32Array;
    readonly sinkTableWordCount: number;
  };
}

type NormalizeResult<T> =
  | { readonly valid: true; readonly value: T }
  | { readonly valid: false; readonly errors: readonly string[] };

function toUint32Array(arr: readonly number[] | Uint32Array): Uint32Array {
  // Always clone to avoid sharing mutable buffers with callers.
  return new Uint32Array(arr);
}

export function normalizeInstallPipelinePayloadV1(
  payload: unknown,
): NormalizeResult<NormalizedInstallPipelinePayloadV1> {
  if (payload === null || typeof payload !== 'object') {
    return { valid: false, errors: ['payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;
  if (p.type !== 'INSTALL_PIPELINE_V1') {
    return { valid: false, errors: [`payload.type must be 'INSTALL_PIPELINE_V1', got '${String(p.type)}'`] };
  }
  if (p.pipeline === null || typeof p.pipeline !== 'object') {
    return { valid: false, errors: ['payload.pipeline must be an object'] };
  }
  const pipeline = p.pipeline as Record<string, unknown>;
  const errors: string[] = [];

  if (!Array.isArray(pipeline.passes) || pipeline.passes.length === 0) {
    errors.push('payload.pipeline.passes must be a non-empty array');
  }
  const shapeBankWords = pipeline.shapeBankWords;
  const shapeBankWordCount = pipeline.shapeBankWordCount;
  if (!Number.isInteger(shapeBankWordCount) || (shapeBankWordCount as number) < 0) {
    errors.push(`shapeBankWordCount must be a non-negative integer, got ${String(shapeBankWordCount)}`);
  }
  if (!Array.isArray(shapeBankWords) && !(shapeBankWords instanceof Uint32Array)) {
    errors.push('payload.pipeline.shapeBankWords must be an array or Uint32Array');
  } else if (Number.isInteger(shapeBankWordCount) && (shapeBankWordCount as number) > (shapeBankWords as unknown[]).length) {
    errors.push(`shapeBankWordCount (${shapeBankWordCount as number}) exceeds shapeBankWords length (${(shapeBankWords as unknown[]).length})`);
  }
  const sinkTableWords = pipeline.sinkTableWords;
  const sinkTableWordCount = pipeline.sinkTableWordCount;
  if (!Number.isInteger(sinkTableWordCount) || (sinkTableWordCount as number) < 0) {
    errors.push(`sinkTableWordCount must be a non-negative integer, got ${String(sinkTableWordCount)}`);
  }
  if (!Array.isArray(sinkTableWords) && !(sinkTableWords instanceof Uint32Array)) {
    errors.push('payload.pipeline.sinkTableWords must be an array or Uint32Array');
  } else if (Number.isInteger(sinkTableWordCount) && (sinkTableWordCount as number) > (sinkTableWords as unknown[]).length) {
    errors.push(`sinkTableWordCount (${sinkTableWordCount as number}) exceeds sinkTableWords length (${(sinkTableWords as unknown[]).length})`);
  }
  const topologyIdByHandle = pipeline.topologyIdByHandle;
  if (!Array.isArray(topologyIdByHandle) && !(topologyIdByHandle instanceof Uint32Array)) {
    errors.push('payload.pipeline.topologyIdByHandle must be an array or Uint32Array');
  }
  const sinkPointerMap = pipeline.sinkPointerMap;
  if (sinkPointerMap === null || sinkPointerMap === undefined || typeof sinkPointerMap !== 'object' || Array.isArray(sinkPointerMap)) {
    errors.push('payload.pipeline.sinkPointerMap must be a plain object');
  } else {
    for (const [k, v] of Object.entries(sinkPointerMap as Record<string, unknown>)) {
      if (typeof k !== 'string' || typeof v !== 'string') {
        errors.push(`sinkPointerMap['${k}'] must be a string, got ${typeof v}`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      pipeline: {
        passes: pipeline.passes as readonly _RustRendererGpuPass[],
        sinkPointerMap: sinkPointerMap as Readonly<Record<string, string>>,
        shapeBankWords: toUint32Array(shapeBankWords as readonly number[]),
        shapeBankWordCount: shapeBankWordCount as number,
        topologyIdByHandle: toUint32Array(topologyIdByHandle as readonly number[]),
        sinkTableWords: toUint32Array(sinkTableWords as readonly number[]),
        sinkTableWordCount: sinkTableWordCount as number,
      },
    },
  };
}

// =============================================================================
// Publish Frame Input Boundary
// =============================================================================

export interface PublishFrameInputBoundaryPayloadV1 {
  readonly type: 'PUBLISH_FRAME_INPUT_V1';
  readonly frame: {
    readonly width: number;
    readonly height: number;
    readonly zoom: number;
    readonly panX: number;
    readonly panY: number;
    readonly timeMs: number;
    readonly inputMouseX: number;
    readonly inputMouseY: number;
    readonly inputMouseButtons: number;
    readonly inputAudioLow: number;
    readonly inputAudioMid: number;
    readonly inputAudioHigh: number;
    readonly inputGaugeActive: number;
    // [LAW:one-source-of-truth] Camera params are required at this boundary.
    // Defaults live in CameraResolver (DEFAULT_CAMERA / PREVIEW_CAMERA) —
    // not here. Missing camera fields are a caller bug, not a normalization concern.
    readonly cameraProjection: number;
    readonly cameraCenterX: number;
    readonly cameraCenterY: number;
    readonly cameraDistance: number;
    readonly cameraTiltRad: number;
    readonly cameraYawRad: number;
    readonly cameraFovYRad: number;
    readonly cameraNear: number;
    readonly cameraFar: number;
  };
}

export interface NormalizedPublishFrameInputBoundaryPayloadV1 {
  readonly type: 'PUBLISH_FRAME_INPUT_V1';
  readonly frame: {
    readonly width: number;
    readonly height: number;
    readonly zoom: number;
    readonly panX: number;
    readonly panY: number;
    readonly timeMs: number;
    readonly inputMouseX: number;
    readonly inputMouseY: number;
    readonly inputMouseButtons: number;
    readonly inputAudioLow: number;
    readonly inputAudioMid: number;
    readonly inputAudioHigh: number;
    readonly inputGaugeActive: number;
    readonly cameraProjection: number;
    readonly cameraCenterX: number;
    readonly cameraCenterY: number;
    readonly cameraDistance: number;
    readonly cameraTiltRad: number;
    readonly cameraYawRad: number;
    readonly cameraFovYRad: number;
    readonly cameraNear: number;
    readonly cameraFar: number;
  };
}

export function normalizePublishFrameInputPayloadV1(
  payload: unknown,
): NormalizeResult<NormalizedPublishFrameInputBoundaryPayloadV1> {
  if (payload === null || typeof payload !== 'object') {
    return { valid: false, errors: ['payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;
  if (p.type !== 'PUBLISH_FRAME_INPUT_V1') {
    return { valid: false, errors: [`payload.type must be 'PUBLISH_FRAME_INPUT_V1'`] };
  }
  if (p.frame === null || typeof p.frame !== 'object') {
    return { valid: false, errors: ['payload.frame must be an object'] };
  }
  const frame = p.frame as Record<string, unknown>;
  const errors: string[] = [];

  const requirePositiveInt = (name: string) => {
    const v = frame[name];
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
      errors.push(`frame.${name} must be a positive integer, got ${String(v)}`);
    }
  };
  const requirePositive = (name: string) => {
    const v = frame[name];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      errors.push(`frame.${name} must be a positive finite number, got ${String(v)}`);
    }
  };
  const requireFinite = (name: string) => {
    const v = frame[name];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`frame.${name} must be a finite number, got ${String(v)}`);
    }
  };
  const requireNonNegative = (name: string) => {
    const v = frame[name];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      errors.push(`frame.${name} must be a non-negative finite number, got ${String(v)}`);
    }
  };

  requirePositiveInt('width');
  requirePositiveInt('height');
  requirePositive('zoom');
  requireFinite('panX');
  requireFinite('panY');
  requireFinite('timeMs');
  requireFinite('inputMouseX');
  requireFinite('inputMouseY');
  requireNonNegative('inputMouseButtons');
  requireFinite('inputAudioLow');
  requireFinite('inputAudioMid');
  requireFinite('inputAudioHigh');
  requireFinite('inputGaugeActive');

  // [LAW:one-source-of-truth] Camera fields are required — defaults live in
  // CameraResolver, not at this boundary. Missing fields are a caller bug.
  requireFinite('cameraProjection');
  requireFinite('cameraCenterX');
  requireFinite('cameraCenterY');
  requirePositive('cameraDistance');
  requireFinite('cameraTiltRad');
  requireFinite('cameraYawRad');
  requirePositive('cameraFovYRad');
  requirePositive('cameraNear');
  requirePositive('cameraFar');

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const f = frame as Record<string, number>;

  return {
    valid: true,
    value: {
      type: 'PUBLISH_FRAME_INPUT_V1',
      frame: {
        width: f.width,
        height: f.height,
        zoom: f.zoom,
        panX: f.panX,
        panY: f.panY,
        timeMs: f.timeMs,
        inputMouseX: f.inputMouseX,
        inputMouseY: f.inputMouseY,
        inputMouseButtons: f.inputMouseButtons,
        inputAudioLow: f.inputAudioLow,
        inputAudioMid: f.inputAudioMid,
        inputAudioHigh: f.inputAudioHigh,
        inputGaugeActive: f.inputGaugeActive,
        cameraProjection: f.cameraProjection,
        cameraCenterX: f.cameraCenterX,
        cameraCenterY: f.cameraCenterY,
        cameraDistance: f.cameraDistance,
        cameraTiltRad: f.cameraTiltRad,
        cameraYawRad: f.cameraYawRad,
        cameraFovYRad: f.cameraFovYRad,
        cameraNear: f.cameraNear,
        cameraFar: f.cameraFar,
      },
    },
  };
}
