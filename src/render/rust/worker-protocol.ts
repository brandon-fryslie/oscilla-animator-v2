// [LAW:one-source-of-truth] Rust worker message ABI is declared in one module
// so worker, renderer facade, and tests consume one canonical contract.
import type { GpuPassStage } from '../../types/gpu-pass-stage';
export interface RustRendererBootstrapConfig {
  readonly maxParticles: number;
  readonly maxShapes: number;
  readonly debugReadbackHz: number;
}

export const RUST_RENDERER_SHAPE_HEADER_WORDS = 16;
export const RUST_RENDERER_SINK_TABLE_HEADER_WORDS = 8;
export const RUST_RENDERER_SINK_TABLE_RECORD_WORDS = 8;
export const RUST_RENDERER_SINK_TABLE_DESCRIPTOR_WORDS = 20;

export function computeRustRendererShapeBankWordCapacity(config: RustRendererBootstrapConfig): number {
  return Math.max(RUST_RENDERER_SHAPE_HEADER_WORDS, Math.floor(config.maxShapes) * RUST_RENDERER_SHAPE_HEADER_WORDS);
}

export function computeRustRendererSinkTableWordCapacity(config: RustRendererBootstrapConfig): number {
  const maxRecords = Math.max(0, Math.floor(config.maxShapes));
  return RUST_RENDERER_SINK_TABLE_HEADER_WORDS
    + maxRecords * RUST_RENDERER_SINK_TABLE_RECORD_WORDS
    + maxRecords * RUST_RENDERER_SINK_TABLE_DESCRIPTOR_WORDS;
}

export interface RustRendererBootstrapMessage {
  readonly type: 'BOOTSTRAP';
  readonly canvas: OffscreenCanvas;
  readonly rendererWasmBytes: ArrayBuffer;
  readonly sharedInput: SharedArrayBuffer;
  readonly sharedShapeBank: SharedArrayBuffer;
  readonly sharedSinkTable: SharedArrayBuffer;
  readonly config: RustRendererBootstrapConfig;
}

export interface RustRendererShutdownMessage {
  readonly type: 'SHUTDOWN';
}

export interface RustRendererGpuPass {
  readonly passId: string;
  readonly stage: GpuPassStage;
  readonly entryPoint: string;
  readonly wgsl: string;
}

export interface RustRendererRebuildGpuPipelinesMessage {
  readonly type: 'REBUILD_GPU_PIPELINES';
  readonly passes: readonly RustRendererGpuPass[];
}

export interface RustRendererResizeCanvasMessage {
  readonly type: 'RESIZE_CANVAS';
  readonly width: number;
  readonly height: number;
}

export interface RustRendererPauseMessage {
  readonly type: 'PAUSE';
}

export interface RustRendererResumeMessage {
  readonly type: 'RESUME';
}

export interface RustRendererInjectPoisonAllocMessage {
  readonly type: 'INJECT_POISON_ALLOC';
}

// [RECOVER-11] Upload MSDF atlas data for Type5 text rendering.
// Data layout: [0]=width, [1]=height, [2..]=packed RGBA pixels (1 u32 per pixel).
export interface RustRendererUploadAtlasMessage {
  readonly type: 'UPLOAD_ATLAS';
  readonly data: Uint32Array;
}

export type RustRendererWorkerInboundMessage =
  | RustRendererBootstrapMessage
  | RustRendererShutdownMessage
  | RustRendererRebuildGpuPipelinesMessage
  | RustRendererResizeCanvasMessage
  | RustRendererPauseMessage
  | RustRendererResumeMessage
  | RustRendererInjectPoisonAllocMessage
  | RustRendererUploadAtlasMessage;

export interface RustRendererBootstrapSuccess {
  readonly type: 'BOOTSTRAP_SUCCESS';
}

export interface RustRendererFatalError {
  readonly type: 'FATAL_ERROR';
  readonly code: string;
  readonly message: string;
}

export interface RustRendererEngineError {
  readonly type: 'ENGINE_ERROR';
  readonly source: 'RUST_PANIC' | 'WEBGPU_VALIDATION' | 'WEBGPU_OOM' | 'WEBGPU_INTERNAL';
  readonly message: string;
  readonly location: string;
  readonly fatal: boolean;
}

export interface RustRendererRebuildGpuPipelinesSuccess {
  readonly type: 'REBUILD_GPU_PIPELINES_SUCCESS';
}

export interface RustRendererRebuildGpuPipelinesFailure {
  readonly type: 'REBUILD_GPU_PIPELINES_FAILURE';
  readonly code: string;
  readonly passId: string;
  readonly message: string;
}

export interface RustRendererDeviceLost {
  readonly type: 'DEVICE_LOST';
  readonly code: string;
  readonly reason: string;
}

export type RustRendererSchedulerState = 'Booting' | 'Running' | 'Paused' | 'Lost';

export interface RustRendererStageTimingsTelemetry {
  readonly inputMarshalMs: number;
  readonly simulationDispatchMs: number;
  readonly fluidPassChainMs: number;
  readonly drawPrepMs: number;
  readonly renderMs: number;
  readonly swapMs: number;
  readonly totalFrameMs: number;
}

export interface RustRendererDispatchCountersTelemetry {
  readonly computeDispatchCount: number;
  readonly computeWorkgroupCount: number;
  readonly activeLaneCount: number;
  readonly guardedLaneCount: number;
}

export interface RustRendererResourceStatsTelemetry {
  readonly shapeBankWordCount: number;
  readonly sinkTableWordCount: number;
  readonly indexedRecordCount: number;
  readonly nonIndexedRecordCount: number;
  readonly totalInstanceCount: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly pingPongIndex: number;
}

export interface RustRendererSchedulerTelemetry {
  readonly stageTimings: RustRendererStageTimingsTelemetry;
  readonly dispatchCounters: RustRendererDispatchCountersTelemetry;
  readonly resourceStats: RustRendererResourceStatsTelemetry;
}

export interface RustRendererSchedulerHeartbeat {
  readonly type: 'SCHEDULER_HEARTBEAT';
  readonly state: RustRendererSchedulerState;
  readonly sequence: number;
  readonly emittedAtMs: number;
  readonly frameCount: number;
  readonly loopCount: number;
  readonly meanTickMs: number;
  readonly stdDevTickMs: number;
  readonly sampleCount: number;
  readonly lastTickMs: number;
  readonly lastSuccessMs: number;
  readonly telemetry: RustRendererSchedulerTelemetry;
}

export interface RustRendererRuntimeEvent {
  readonly type: 'RUNTIME_EVENT';
  readonly severity: 'error' | 'fatal';
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly state: RustRendererSchedulerState;
  readonly frameCount: number;
  readonly loopCount: number;
  readonly emittedAtMs: number;
}

// [RECOVER-10] [LAW:single-enforcer] One canonical readback snapshot type for
// structured GPU-to-host observability data published by the worker.
export interface RustRendererIndirectArgsRecord {
  readonly indexCount: number;
  readonly instanceCount: number;
  readonly firstIndex: number;
  readonly baseVertex: number;
  readonly firstInstance: number;
}

export interface RustRendererReadbackSnapshot {
  readonly type: 'READBACK_SNAPSHOT';
  readonly frameCount: number;
  readonly capturedAtMs: number;
  readonly indirectArgs: readonly RustRendererIndirectArgsRecord[];
  readonly instanceProbeValues: Float32Array;
}

export type RustRendererWorkerOutboundMessage =
  | RustRendererBootstrapSuccess
  | RustRendererEngineError
  | RustRendererFatalError
  | RustRendererRebuildGpuPipelinesSuccess
  | RustRendererRebuildGpuPipelinesFailure
  | RustRendererDeviceLost
  | RustRendererSchedulerHeartbeat
  | RustRendererRuntimeEvent
  | RustRendererReadbackSnapshot;
