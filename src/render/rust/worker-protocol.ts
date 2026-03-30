// [LAW:one-source-of-truth] Rust worker message ABI is declared in one module
// so worker, renderer facade, and tests consume one canonical contract.

export interface RustRendererBootstrapConfig {
  readonly debugReadbackHz: number;
}

export interface RustRendererBootstrapMessage {
  readonly type: 'BOOTSTRAP';
  readonly canvas: OffscreenCanvas;
  readonly rendererWasmBytes: ArrayBuffer;
  // Heartbeat SharedArrayBuffer — zero-overhead health monitoring.
  // Main-thread circuit breaker reads scheduler state via Atomics.
  readonly sharedHeartbeat: SharedArrayBuffer;
  readonly config: RustRendererBootstrapConfig;
  readonly initialWidth: number;
  readonly initialHeight: number;
}

export interface RustRendererShutdownMessage {
  readonly type: 'SHUTDOWN';
}

export interface RustRendererInstallPipelineMessage {
  readonly type: 'INSTALL_PIPELINE';
  // JSON-serialized PipelineInstallPayload (defined in boundary-contract.ts)
  readonly payloadJson: string;
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

export interface RustRendererSetTelemetryEnabledMessage {
  readonly type: 'SET_TELEMETRY_ENABLED';
  readonly enabled: boolean;
}

export type RustRendererWorkerInboundMessage =
  | RustRendererBootstrapMessage
  | RustRendererShutdownMessage
  | RustRendererInstallPipelineMessage
  | RustRendererPauseMessage
  | RustRendererResumeMessage
  | RustRendererInjectPoisonAllocMessage
  | RustRendererSetTelemetryEnabledMessage;

// ─── Outbound messages ──────────────────────────────────────────────────────

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

export interface RustRendererInstallPipelineSuccess {
  readonly type: 'INSTALL_PIPELINE_SUCCESS';
  readonly receiptJson: string;
}

export interface RustRendererInstallPipelineFailure {
  readonly type: 'INSTALL_PIPELINE_FAILURE';
  readonly receiptJson: string;
}

export interface RustRendererDeviceLost {
  readonly type: 'DEVICE_LOST';
  readonly code: string;
  readonly reason: string;
}

export type RustRendererSchedulerState = 'Booting' | 'Running' | 'Paused' | 'Lost';

export interface RustRendererStageTimingsTelemetry {
  readonly totalFrameMs: number;
}

export interface RustRendererSchedulerTelemetry {
  readonly stageTimings: RustRendererStageTimingsTelemetry;
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

export type RustRendererWorkerOutboundMessage =
  | RustRendererBootstrapSuccess
  | RustRendererEngineError
  | RustRendererFatalError
  | RustRendererInstallPipelineSuccess
  | RustRendererInstallPipelineFailure
  | RustRendererDeviceLost
  | RustRendererSchedulerHeartbeat
  | RustRendererRuntimeEvent;
