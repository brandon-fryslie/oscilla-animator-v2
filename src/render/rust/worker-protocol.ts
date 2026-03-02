// [LAW:one-source-of-truth] Rust worker message ABI is declared in one module
// so worker, renderer facade, and tests consume one canonical contract.
export interface RustRendererBootstrapConfig {
  readonly maxParticles: number;
  readonly maxShapes: number;
  readonly debugReadbackHz: number;
}

export interface RustRendererBootstrapMessage {
  readonly type: 'BOOTSTRAP';
  readonly canvas: OffscreenCanvas;
  readonly sharedInput: SharedArrayBuffer;
  readonly config: RustRendererBootstrapConfig;
}

export interface RustRendererShutdownMessage {
  readonly type: 'SHUTDOWN';
}

export interface RustRendererRebuildPipelineMessage {
  readonly type: 'REBUILD_PIPELINE';
  readonly simulationWgsl: string;
  readonly assemblyWgsl: string;
  readonly uberShaderWgsl: string;
  readonly particleCount: number;
  readonly shapeCount: number;
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

export type RustRendererWorkerInboundMessage =
  | RustRendererBootstrapMessage
  | RustRendererShutdownMessage
  | RustRendererRebuildPipelineMessage
  | RustRendererResizeCanvasMessage
  | RustRendererPauseMessage
  | RustRendererResumeMessage
  | RustRendererInjectPoisonAllocMessage;

export interface RustRendererBootstrapSuccess {
  readonly type: 'BOOTSTRAP_SUCCESS';
}

export interface RustRendererFatalError {
  readonly type: 'FATAL_ERROR';
  readonly code: string;
  readonly message: string;
}

export interface RustRendererRebuildPipelineSuccess {
  readonly type: 'REBUILD_PIPELINE_SUCCESS';
}

export type RustRendererSchedulerState = 'Booting' | 'Running' | 'Paused' | 'Lost';

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
}

export interface RustRendererRuntimeEvent {
  readonly type: 'RUNTIME_EVENT';
  readonly severity: 'error' | 'fatal';
  readonly code: string;
  readonly message: string;
  readonly state: RustRendererSchedulerState;
  readonly frameCount: number;
  readonly loopCount: number;
  readonly emittedAtMs: number;
}

export type RustRendererWorkerOutboundMessage =
  | RustRendererBootstrapSuccess
  | RustRendererFatalError
  | RustRendererRebuildPipelineSuccess
  | RustRendererSchedulerHeartbeat
  | RustRendererRuntimeEvent;
