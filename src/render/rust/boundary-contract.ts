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
  return arr instanceof Uint32Array ? arr : new Uint32Array(arr);
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
  const shapeBankWordCount = typeof pipeline.shapeBankWordCount === 'number' ? pipeline.shapeBankWordCount : -1;
  if (!Array.isArray(shapeBankWords) && !(shapeBankWords instanceof Uint32Array)) {
    errors.push('payload.pipeline.shapeBankWords must be an array or Uint32Array');
  } else if (shapeBankWordCount < 0 || shapeBankWordCount > (shapeBankWords as unknown[]).length) {
    errors.push(`shapeBankWordCount (${shapeBankWordCount}) exceeds shapeBankWords length (${(shapeBankWords as unknown[]).length})`);
  }
  const sinkTableWords = pipeline.sinkTableWords;
  const sinkTableWordCount = typeof pipeline.sinkTableWordCount === 'number' ? pipeline.sinkTableWordCount : -1;
  if (!Array.isArray(sinkTableWords) && !(sinkTableWords instanceof Uint32Array)) {
    errors.push('payload.pipeline.sinkTableWords must be an array or Uint32Array');
  } else if (sinkTableWordCount < 0 || sinkTableWordCount > (sinkTableWords as unknown[]).length) {
    errors.push(`sinkTableWordCount (${sinkTableWordCount}) exceeds sinkTableWords length (${(sinkTableWords as unknown[]).length})`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      pipeline: {
        passes: pipeline.passes as readonly _RustRendererGpuPass[],
        sinkPointerMap: (pipeline.sinkPointerMap ?? {}) as Readonly<Record<string, string>>,
        shapeBankWords: toUint32Array(shapeBankWords as readonly number[]),
        shapeBankWordCount,
        topologyIdByHandle: toUint32Array((pipeline.topologyIdByHandle ?? []) as readonly number[]),
        sinkTableWords: toUint32Array(sinkTableWords as readonly number[]),
        sinkTableWordCount,
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
    // Camera params (optional — defaults applied by CameraResolver)
    readonly cameraProjection?: number;
    readonly cameraCenterX?: number;
    readonly cameraCenterY?: number;
    readonly cameraDistance?: number;
    readonly cameraTiltRad?: number;
    readonly cameraYawRad?: number;
    readonly cameraFovYRad?: number;
    readonly cameraNear?: number;
    readonly cameraFar?: number;
    readonly [key: string]: number | undefined;
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

  requirePositive('width');
  requirePositive('height');
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
        // Camera defaults: ortho identity when not provided
        cameraProjection: f.cameraProjection ?? 0,
        cameraCenterX: f.cameraCenterX ?? 0.5,
        cameraCenterY: f.cameraCenterY ?? 0.5,
        cameraDistance: f.cameraDistance ?? 2.0,
        cameraTiltRad: f.cameraTiltRad ?? 0,
        cameraYawRad: f.cameraYawRad ?? 0,
        cameraFovYRad: f.cameraFovYRad ?? 0.7854,
        cameraNear: f.cameraNear ?? 0.01,
        cameraFar: f.cameraFar ?? 100,
      },
    },
  };
}
