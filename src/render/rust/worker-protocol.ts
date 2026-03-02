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
  readonly message: string;
}

export interface RustRendererRebuildPipelineSuccess {
  readonly type: 'REBUILD_PIPELINE_SUCCESS';
}

export interface RustRendererDeviceLost {
  readonly type: 'DEVICE_LOST';
  readonly reason: string;
}

export interface RustRendererTelemetryPacket {
  readonly type: 'RUNTIME_TELEMETRY';
  readonly meanMs: number;
  readonly stdDevMs: number;
  readonly sampleCount: number;
  readonly frameCount: number;
}

export type RustRendererWorkerOutboundMessage =
  | RustRendererBootstrapSuccess
  | RustRendererFatalError
  | RustRendererRebuildPipelineSuccess
  | RustRendererDeviceLost
  | RustRendererTelemetryPacket;
