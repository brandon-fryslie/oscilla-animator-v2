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

export interface RustRendererRebuildSimulationPipelineMessage {
  readonly type: 'REBUILD_SIMULATION_PIPELINE';
  readonly simulationWgsl: string;
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
  | RustRendererRebuildSimulationPipelineMessage
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

export interface RustRendererRebuildSimulationPipelineSuccess {
  readonly type: 'REBUILD_SIMULATION_PIPELINE_SUCCESS';
}

export interface RustRendererDeviceLost {
  readonly type: 'DEVICE_LOST';
  readonly code: string;
  readonly reason: string;
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
  | RustRendererRebuildSimulationPipelineSuccess
  | RustRendererDeviceLost
  | RustRendererSchedulerHeartbeat
  | RustRendererRuntimeEvent;
