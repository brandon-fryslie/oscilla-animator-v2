/**
 * WASM Renderer Canonical Boundary Contract
 *
 * [LAW:one-source-of-truth] All JSON payloads that cross JS→Rust/WASM renderer
 * boundaries are defined, validated, and normalized here.
 */

import { type GpuPassStage, isGpuPassStage } from '../../types/gpu-pass-stage';
import type {
  MemoryManifestIR,
  MemoryResourceIR,
  MemoryResourceKind,
  Texture2DFormat,
} from '../../compiler/ir/program';
import type { RustRendererGpuPass, RustRendererSinkPointerMap } from './worker-protocol';

export type {
  RustRendererGpuPass,
  RustRendererRebuildGpuPipelinesSuccess,
  RustRendererRebuildGpuPipelinesFailure,
} from './worker-protocol';
export type {
  MemoryManifestIR,
  MemoryResourceIR,
  MemoryResourceKind,
  Texture2DFormat,
} from '../../compiler/ir/program';
export { type GpuPassStage, isGpuPassStage } from '../../types/gpu-pass-stage';

const MAX_UINT32 = 0xFFFF_FFFF;

export interface InstallPipelineBoundaryPayloadV1 {
  readonly type: 'INSTALL_PIPELINE_V1';
  readonly pipeline: {
    readonly passes: readonly RustRendererGpuPass[];
    readonly sinkPointerMap: Readonly<Record<string, string>>;
    readonly shapeBankWords: readonly number[];
    readonly shapeBankWordCount: number;
    readonly topologyIdByHandle: readonly number[];
    readonly sinkTableWords: readonly number[];
    readonly sinkTableWordCount: number;
  };
}

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
    // not here. Missing camera fields are a caller bug.
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

export type RustRendererBoundaryPayloadV1 =
  | InstallPipelineBoundaryPayloadV1
  | PublishFrameInputBoundaryPayloadV1;

export interface NormalizedInstallPipelinePayloadV1 {
  readonly type: 'INSTALL_PIPELINE_V1';
  readonly pipeline: {
    readonly passes: readonly RustRendererGpuPass[];
    readonly sinkPointerMap: RustRendererSinkPointerMap;
    readonly shapeBankWords: Uint32Array;
    readonly shapeBankWordCount: number;
    readonly topologyIdByHandle: Uint32Array;
    readonly sinkTableWords: Uint32Array;
    readonly sinkTableWordCount: number;
  };
}

export interface NormalizedPublishFrameInputBoundaryPayloadV1 {
  readonly type: 'PUBLISH_FRAME_INPUT_V1';
  readonly frame: PublishFrameInputBoundaryPayloadV1['frame'];
}

export type NormalizedRustRendererBoundaryPayloadV1 =
  | NormalizedInstallPipelinePayloadV1
  | NormalizedPublishFrameInputBoundaryPayloadV1;

type ValidationSuccess<T> = { readonly valid: true; readonly value: T };
type ValidationFailure = { readonly valid: false; readonly errors: string[] };
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isFiniteUint32(value: number): boolean {
  return Number.isFinite(value)
    && Number.isInteger(value)
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_UINT32;
}

function pushError(errors: string[], path: string, message: string): void {
  errors.push(`${path}: ${message}`);
}

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): string | null {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    pushError(errors, `${path}.${key}`, 'must be a non-empty string');
    return null;
  }
  return value;
}

function readRequiredFiniteNumber(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): number | null {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    pushError(errors, `${path}.${key}`, 'must be a finite number');
    return null;
  }
  return value;
}

function readRequiredPositiveInt(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): number | null {
  const value = source[key];
  if (!isFiniteUint32(value as number) || (value as number) <= 0) {
    pushError(errors, `${path}.${key}`, 'must be a positive uint32');
    return null;
  }
  return value as number;
}

function readRequiredUint32(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): number | null {
  const value = source[key];
  if (!isFiniteUint32(value as number)) {
    pushError(errors, `${path}.${key}`, 'must be a uint32');
    return null;
  }
  return value as number;
}

function normalizeGpuPasses(
  rawPasses: unknown,
  path: string,
  errors: string[],
): RustRendererGpuPass[] {
  if (!Array.isArray(rawPasses)) {
    pushError(errors, path, 'must be an array');
    return [];
  }
  if (rawPasses.length === 0) {
    pushError(errors, path, 'must contain at least one pass');
    return [];
  }

  const normalized: RustRendererGpuPass[] = [];
  for (let index = 0; index < rawPasses.length; index++) {
    const entryPath = `${path}[${index}]`;
    const rawEntry = rawPasses[index];
    if (!isRecord(rawEntry)) {
      pushError(errors, entryPath, 'must be an object');
      continue;
    }

    const passId = readRequiredString(rawEntry, 'passId', entryPath, errors);
    const stageRaw = rawEntry.stage;
    const entryPoint = readRequiredString(rawEntry, 'entryPoint', entryPath, errors);
    const wgsl = readRequiredString(rawEntry, 'wgsl', entryPath, errors);
    const stage: GpuPassStage | null =
      typeof stageRaw === 'string' && isGpuPassStage(stageRaw) ? stageRaw : null;
    if (stage === null) {
      pushError(
        errors,
        `${entryPath}.stage`,
        `must be one of canonical GPU pass stages (got ${String(stageRaw)})`,
      );
    } else if (stage !== 'compute') {
      // [LAW:no-silent-fallbacks] Rust parse_gpu_pass_specs currently supports
      // only compute stage; reject unsupported stages at boundary.
      pushError(errors, `${entryPath}.stage`, 'only "compute" is currently supported by Rust renderer');
    }

    if (!passId || !stage || !entryPoint || !wgsl) {
      continue;
    }

    const memoryManifest = rawEntry.memoryManifest;
    normalized.push(
      memoryManifest === undefined
        ? { passId, stage, entryPoint, wgsl }
        : { passId, stage, entryPoint, wgsl, memoryManifest: memoryManifest as MemoryManifestIR },
    );
  }
  return normalized;
}

function normalizeUint32ArrayField(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): Uint32Array {
  const value = source[key];
  if (value instanceof Uint32Array) {
    return new Uint32Array(value);
  }
  if (!Array.isArray(value)) {
    pushError(errors, `${path}.${key}`, 'must be an array (or Uint32Array) of uint32 numbers');
    return new Uint32Array(0);
  }
  const words = new Uint32Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const word = value[i];
    if (!isFiniteUint32(word as number)) {
      pushError(errors, `${path}.${key}[${i}]`, 'must be a uint32 number');
      continue;
    }
    words[i] = (word as number) >>> 0;
  }
  return words;
}

function normalizeSinkPointerMap(
  value: unknown,
  path: string,
  errors: string[],
): RustRendererSinkPointerMap {
  if (!isRecord(value)) {
    pushError(errors, path, 'must be an object map of sink pointer keys to resource IDs');
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, rawResourceId] of Object.entries(value)) {
    if (typeof rawResourceId !== 'string' || rawResourceId.trim().length === 0) {
      pushError(errors, `${path}.${key}`, 'must be a non-empty string resource ID');
      continue;
    }
    normalized[key] = rawResourceId;
  }
  return normalized;
}

export function validateInstallPipelinePayloadV1(payload: unknown): ValidationResult<NormalizedInstallPipelinePayloadV1> {
  const errors: string[] = [];
  if (!isRecord(payload)) {
    return { valid: false, errors: ['payload: must be an object'] };
  }
  if (payload.type !== 'INSTALL_PIPELINE_V1') {
    pushError(errors, 'payload.type', `must equal "INSTALL_PIPELINE_V1" (got ${String(payload.type)})`);
  }

  const pipelineRaw = payload.pipeline;
  if (!isRecord(pipelineRaw)) {
    pushError(errors, 'payload.pipeline', 'must be an object');
    return { valid: false, errors };
  }

  const passes = normalizeGpuPasses(pipelineRaw.passes, 'payload.pipeline.passes', errors);
  const sinkPointerMap = normalizeSinkPointerMap(
    pipelineRaw.sinkPointerMap,
    'payload.pipeline.sinkPointerMap',
    errors,
  );
  const shapeBankWords = normalizeUint32ArrayField(
    pipelineRaw,
    'shapeBankWords',
    'payload.pipeline',
    errors,
  );
  const topologyIdByHandle = normalizeUint32ArrayField(
    pipelineRaw,
    'topologyIdByHandle',
    'payload.pipeline',
    errors,
  );
  const sinkTableWords = normalizeUint32ArrayField(
    pipelineRaw,
    'sinkTableWords',
    'payload.pipeline',
    errors,
  );
  const shapeBankWordCount = readRequiredUint32(
    pipelineRaw,
    'shapeBankWordCount',
    'payload.pipeline',
    errors,
  );
  const sinkTableWordCount = readRequiredUint32(
    pipelineRaw,
    'sinkTableWordCount',
    'payload.pipeline',
    errors,
  );

  if (shapeBankWordCount !== null) {
    if (shapeBankWordCount > shapeBankWords.length) {
      pushError(
        errors,
        'payload.pipeline.shapeBankWordCount',
        `must be <= shapeBankWords.length (${shapeBankWords.length})`,
      );
    }
    if (topologyIdByHandle.length < shapeBankWordCount) {
      pushError(
        errors,
        'payload.pipeline.topologyIdByHandle',
        `must contain at least shapeBankWordCount (${shapeBankWordCount}) entries`,
      );
    }
  }
  if (sinkTableWordCount !== null && sinkTableWordCount > sinkTableWords.length) {
    pushError(
      errors,
      'payload.pipeline.sinkTableWordCount',
      `must be <= sinkTableWords.length (${sinkTableWords.length})`,
    );
  }

  if (errors.length > 0 || shapeBankWordCount === null || sinkTableWordCount === null) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      type: 'INSTALL_PIPELINE_V1',
      pipeline: {
        passes,
        sinkPointerMap,
        shapeBankWords,
        shapeBankWordCount,
        topologyIdByHandle,
        sinkTableWords,
        sinkTableWordCount: sinkTableWordCount >>> 0,
      },
    },
  };
}

export function validatePublishFrameInputPayloadV1(
  payload: unknown,
): ValidationResult<NormalizedPublishFrameInputBoundaryPayloadV1> {
  const errors: string[] = [];
  if (!isRecord(payload)) {
    return { valid: false, errors: ['payload: must be an object'] };
  }
  if (payload.type !== 'PUBLISH_FRAME_INPUT_V1') {
    pushError(errors, 'payload.type', `must equal "PUBLISH_FRAME_INPUT_V1" (got ${String(payload.type)})`);
  }
  const frameRaw = payload.frame;
  if (!isRecord(frameRaw)) {
    pushError(errors, 'payload.frame', 'must be an object');
    return { valid: false, errors };
  }

  const width = readRequiredPositiveInt(frameRaw, 'width', 'payload.frame', errors);
  const height = readRequiredPositiveInt(frameRaw, 'height', 'payload.frame', errors);
  const zoom = readRequiredFiniteNumber(frameRaw, 'zoom', 'payload.frame', errors);
  const panX = readRequiredFiniteNumber(frameRaw, 'panX', 'payload.frame', errors);
  const panY = readRequiredFiniteNumber(frameRaw, 'panY', 'payload.frame', errors);
  const timeMs = readRequiredFiniteNumber(frameRaw, 'timeMs', 'payload.frame', errors);
  const inputMouseX = readRequiredFiniteNumber(frameRaw, 'inputMouseX', 'payload.frame', errors);
  const inputMouseY = readRequiredFiniteNumber(frameRaw, 'inputMouseY', 'payload.frame', errors);
  const inputAudioLow = readRequiredFiniteNumber(frameRaw, 'inputAudioLow', 'payload.frame', errors);
  const inputAudioMid = readRequiredFiniteNumber(frameRaw, 'inputAudioMid', 'payload.frame', errors);
  const inputAudioHigh = readRequiredFiniteNumber(frameRaw, 'inputAudioHigh', 'payload.frame', errors);
  const inputGaugeActive = readRequiredFiniteNumber(frameRaw, 'inputGaugeActive', 'payload.frame', errors);
  const inputMouseButtons = readRequiredUint32(frameRaw, 'inputMouseButtons', 'payload.frame', errors);

  if (typeof zoom === 'number' && zoom <= 0) {
    pushError(errors, 'payload.frame.zoom', 'must be > 0');
  }

  // [LAW:one-source-of-truth] Camera fields are required — defaults live in
  // CameraResolver, not at this boundary. Missing fields are a caller bug.
  const cameraProjectionRaw = readRequiredFiniteNumber(frameRaw, 'cameraProjection', 'payload.frame', errors);
  if (typeof cameraProjectionRaw === 'number' && cameraProjectionRaw !== 0 && cameraProjectionRaw !== 1) {
    pushError(errors, 'payload.frame.cameraProjection', `must be 0 (ortho) or 1 (perspective), got ${cameraProjectionRaw}`);
  }
  const cameraCenterX = readRequiredFiniteNumber(frameRaw, 'cameraCenterX', 'payload.frame', errors);
  const cameraCenterY = readRequiredFiniteNumber(frameRaw, 'cameraCenterY', 'payload.frame', errors);
  const cameraDistance = readRequiredFiniteNumber(frameRaw, 'cameraDistance', 'payload.frame', errors);
  const cameraTiltRad = readRequiredFiniteNumber(frameRaw, 'cameraTiltRad', 'payload.frame', errors);
  const cameraYawRad = readRequiredFiniteNumber(frameRaw, 'cameraYawRad', 'payload.frame', errors);
  const cameraFovYRad = readRequiredFiniteNumber(frameRaw, 'cameraFovYRad', 'payload.frame', errors);
  const cameraNear = readRequiredFiniteNumber(frameRaw, 'cameraNear', 'payload.frame', errors);
  const cameraFar = readRequiredFiniteNumber(frameRaw, 'cameraFar', 'payload.frame', errors);
  if (typeof cameraDistance === 'number' && cameraDistance <= 0) {
    pushError(errors, 'payload.frame.cameraDistance', 'must be > 0');
  }
  if (typeof cameraFovYRad === 'number' && cameraFovYRad <= 0) {
    pushError(errors, 'payload.frame.cameraFovYRad', 'must be > 0');
  }
  if (typeof cameraNear === 'number' && cameraNear <= 0) {
    pushError(errors, 'payload.frame.cameraNear', 'must be > 0');
  }
  if (typeof cameraFar === 'number' && typeof cameraNear === 'number' && cameraFar <= cameraNear) {
    pushError(errors, 'payload.frame.cameraFar', `must be > cameraNear (${cameraNear})`);
  }

  if (
    errors.length > 0
    || width === null
    || height === null
    || zoom === null
    || panX === null
    || panY === null
    || timeMs === null
    || inputMouseX === null
    || inputMouseY === null
    || inputMouseButtons === null
    || inputAudioLow === null
    || inputAudioMid === null
    || inputAudioHigh === null
    || inputGaugeActive === null
    || cameraProjectionRaw === null
    || cameraCenterX === null
    || cameraCenterY === null
    || cameraDistance === null
    || cameraTiltRad === null
    || cameraYawRad === null
    || cameraFovYRad === null
    || cameraNear === null
    || cameraFar === null
  ) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      type: 'PUBLISH_FRAME_INPUT_V1',
      frame: {
        width,
        height,
        zoom,
        panX,
        panY,
        timeMs,
        inputMouseX,
        inputMouseY,
        inputMouseButtons,
        inputAudioLow,
        inputAudioMid,
        inputAudioHigh,
        inputGaugeActive,
        cameraProjection: cameraProjectionRaw,
        cameraCenterX,
        cameraCenterY,
        cameraDistance,
        cameraTiltRad,
        cameraYawRad,
        cameraFovYRad,
        cameraNear,
        cameraFar,
      },
    },
  };
}

export function validateRustRendererBoundaryPayloadV1(
  payload: unknown,
): ValidationResult<NormalizedRustRendererBoundaryPayloadV1> {
  if (!isRecord(payload)) {
    return { valid: false, errors: ['payload: must be an object'] };
  }
  if (payload.type === 'INSTALL_PIPELINE_V1') {
    return validateInstallPipelinePayloadV1(payload);
  }
  if (payload.type === 'PUBLISH_FRAME_INPUT_V1') {
    return validatePublishFrameInputPayloadV1(payload);
  }
  return {
    valid: false,
    errors: [
      `payload.type: unsupported message type "${String(payload.type)}" (expected INSTALL_PIPELINE_V1 or PUBLISH_FRAME_INPUT_V1)`,
    ],
  };
}

/**
 * Validate raw pass-array JSON used by the dockview payload tester.
 *
 * [LAW:single-enforcer] This helper reuses the canonical pass normalizer so
 * pass-shape checks live in one boundary contract module.
 */
export function validateRawPayload(
  json: unknown
): { valid: true; passes: RustRendererGpuPass[] } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const passes = normalizeGpuPasses(json, 'passes', errors);
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, passes };
}
