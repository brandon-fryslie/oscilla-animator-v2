/// <reference lib="webworker" />

import {
  attachRustRendererSharedInput,
  attachRustRendererSharedShapeBank,
  attachRustRendererSharedSinkTable,
  injectRustRendererPoisonAlloc,
  initRustRendererEngine,
  initRustRendererWasm,
  pauseRustRendererEngine,
  rebuildRustRendererGpuPipelines,
  resumeRustRendererEngine,
  resizeRustRendererSurface,
  takeRustRendererFramePacingPacket,
} from '../wasm/oscilla_rust_renderer';
import type {
  RustRendererRuntimeEvent,
  RustRendererSchedulerHeartbeat,
  RustRendererSchedulerState,
  RustRendererWorkerInboundMessage,
  RustRendererWorkerOutboundMessage,
} from './worker-protocol';

interface RawSchedulerHeartbeat {
  readonly sequence: number;
  readonly state: string;
  readonly emittedAtMs: number;
  readonly frameCount: number;
  readonly loopCount: number;
  readonly meanTickMs: number;
  readonly stdDevTickMs: number;
  readonly sampleCount: number;
  readonly lastTickMs: number;
  readonly lastSuccessMs: number;
  readonly telemetry: RawSchedulerTelemetry;
}

interface RawSchedulerStageTimingsTelemetry {
  readonly inputMarshalMs: number;
  readonly simulationDispatchMs: number;
  readonly fluidPassChainMs: number;
  readonly drawPrepMs: number;
  readonly renderMs: number;
  readonly swapMs: number;
  readonly totalFrameMs: number;
}

interface RawSchedulerDispatchCountersTelemetry {
  readonly computeDispatchCount: number;
  readonly computeWorkgroupCount: number;
  readonly activeLaneCount: number;
  readonly guardedLaneCount: number;
}

interface RawSchedulerResourceStatsTelemetry {
  readonly shapeBankWordCount: number;
  readonly sinkTableWordCount: number;
  readonly indexedRecordCount: number;
  readonly nonIndexedRecordCount: number;
  readonly totalInstanceCount: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly pingPongIndex: number;
}

interface RawSchedulerTelemetry {
  readonly stageTimings: RawSchedulerStageTimingsTelemetry;
  readonly dispatchCounters: RawSchedulerDispatchCountersTelemetry;
  readonly resourceStats: RawSchedulerResourceStatsTelemetry;
}

interface RawRuntimeEvent {
  readonly severity: string;
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly state: string;
  readonly frameCount: number;
  readonly loopCount: number;
  readonly emittedAtMs: number;
}

interface RawSchedulerPacket {
  readonly state: string;
  readonly heartbeat: RawSchedulerHeartbeat;
  readonly events: readonly RawRuntimeEvent[];
}

const POLL_INTERVAL_MS = 250;

let bootstrapped = false;
let bootstrapInFlight = false;
let runtimePollTimer: ReturnType<typeof setInterval> | null = null;
let deviceLostNotified = false;

function postWorkerMessage(message: RustRendererWorkerOutboundMessage): void {
  self.postMessage(message);
}

function postWorkerFatalError(code: string, message: string): void {
  postWorkerMessage({ type: 'FATAL_ERROR', code, message });
}

function postDeviceLost(code: string, reason: string): void {
  if (deviceLostNotified) {
    return;
  }
  deviceLostNotified = true;
  postWorkerMessage({
    type: 'DEVICE_LOST',
    code,
    reason,
  });
}

function isSchedulerState(value: unknown): value is RustRendererSchedulerState {
  return value === 'Booting' || value === 'Running' || value === 'Paused' || value === 'Lost';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isRawSchedulerStageTimingsTelemetry(value: unknown): value is RawSchedulerStageTimingsTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerStageTimingsTelemetry>;
  return (
    isFiniteNumber(telemetry.inputMarshalMs)
    && isFiniteNumber(telemetry.simulationDispatchMs)
    && isFiniteNumber(telemetry.fluidPassChainMs)
    && isFiniteNumber(telemetry.drawPrepMs)
    && isFiniteNumber(telemetry.renderMs)
    && isFiniteNumber(telemetry.swapMs)
    && isFiniteNumber(telemetry.totalFrameMs)
  );
}

function isRawSchedulerDispatchCountersTelemetry(value: unknown): value is RawSchedulerDispatchCountersTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerDispatchCountersTelemetry>;
  return (
    isFiniteNumber(telemetry.computeDispatchCount)
    && isFiniteNumber(telemetry.computeWorkgroupCount)
    && isFiniteNumber(telemetry.activeLaneCount)
    && isFiniteNumber(telemetry.guardedLaneCount)
  );
}

function isRawSchedulerResourceStatsTelemetry(value: unknown): value is RawSchedulerResourceStatsTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerResourceStatsTelemetry>;
  return (
    isFiniteNumber(telemetry.shapeBankWordCount)
    && isFiniteNumber(telemetry.sinkTableWordCount)
    && isFiniteNumber(telemetry.indexedRecordCount)
    && isFiniteNumber(telemetry.nonIndexedRecordCount)
    && isFiniteNumber(telemetry.totalInstanceCount)
    && isFiniteNumber(telemetry.canvasWidth)
    && isFiniteNumber(telemetry.canvasHeight)
    && isFiniteNumber(telemetry.pingPongIndex)
  );
}

function isRawSchedulerTelemetry(value: unknown): value is RawSchedulerTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerTelemetry>;
  return (
    isRawSchedulerStageTimingsTelemetry(telemetry.stageTimings)
    && isRawSchedulerDispatchCountersTelemetry(telemetry.dispatchCounters)
    && isRawSchedulerResourceStatsTelemetry(telemetry.resourceStats)
  );
}

function isRawSchedulerHeartbeat(value: unknown): value is RawSchedulerHeartbeat {
  if (!value || typeof value !== 'object') return false;
  const heartbeat = value as Partial<RawSchedulerHeartbeat>;
  return (
    isFiniteNumber(heartbeat.sequence)
    && typeof heartbeat.state === 'string'
    && isFiniteNumber(heartbeat.emittedAtMs)
    && isFiniteNumber(heartbeat.frameCount)
    && isFiniteNumber(heartbeat.loopCount)
    && isFiniteNumber(heartbeat.meanTickMs)
    && isFiniteNumber(heartbeat.stdDevTickMs)
    && isFiniteNumber(heartbeat.sampleCount)
    && isFiniteNumber(heartbeat.lastTickMs)
    && isFiniteNumber(heartbeat.lastSuccessMs)
    && isRawSchedulerTelemetry(heartbeat.telemetry)
  );
}

function isRawRuntimeEvent(value: unknown): value is RawRuntimeEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<RawRuntimeEvent>;
  return (
    typeof event.severity === 'string'
    && typeof event.code === 'string'
    && typeof event.stage === 'string'
    && typeof event.message === 'string'
    && typeof event.state === 'string'
    && isFiniteNumber(event.frameCount)
    && isFiniteNumber(event.loopCount)
    && isFiniteNumber(event.emittedAtMs)
  );
}

function asRuntimeSeverity(value: string): 'error' | 'fatal' {
  return value === 'fatal' ? 'fatal' : 'error';
}

function parseSchedulerPacket(packet: unknown): RawSchedulerPacket | null {
  if (!packet || typeof packet !== 'object') return null;
  const candidate = packet as Partial<RawSchedulerPacket>;
  if (typeof candidate.state !== 'string' || !isRawSchedulerHeartbeat(candidate.heartbeat)) return null;
  if (!Array.isArray(candidate.events)) return null;
  if (!candidate.events.every(isRawRuntimeEvent)) return null;
  if (!isSchedulerState(candidate.state)) return null;
  if (!isSchedulerState(candidate.heartbeat.state)) return null;
  if (!candidate.events.every((event) => isSchedulerState(event.state))) return null;
  return {
    state: candidate.state,
    heartbeat: candidate.heartbeat,
    events: candidate.events,
  };
}

function toOutboundHeartbeat(raw: RawSchedulerHeartbeat): RustRendererSchedulerHeartbeat {
  const state = isSchedulerState(raw.state) ? raw.state : 'Lost';
  return {
    type: 'SCHEDULER_HEARTBEAT',
    state,
    sequence: raw.sequence,
    emittedAtMs: raw.emittedAtMs,
    frameCount: raw.frameCount,
    loopCount: raw.loopCount,
    meanTickMs: raw.meanTickMs,
    stdDevTickMs: raw.stdDevTickMs,
    sampleCount: raw.sampleCount,
    lastTickMs: raw.lastTickMs,
    lastSuccessMs: raw.lastSuccessMs,
    telemetry: raw.telemetry,
  };
}

function toOutboundRuntimeEvent(raw: RawRuntimeEvent): RustRendererRuntimeEvent {
  return {
    type: 'RUNTIME_EVENT',
    severity: asRuntimeSeverity(raw.severity),
    code: raw.code,
    stage: raw.stage,
    message: raw.message,
    state: isSchedulerState(raw.state) ? raw.state : 'Lost',
    frameCount: raw.frameCount,
    loopCount: raw.loopCount,
    emittedAtMs: raw.emittedAtMs,
  };
}

async function handleBootstrap(message: Extract<RustRendererWorkerInboundMessage, { type: 'BOOTSTRAP' }>): Promise<void> {
  if (bootstrapped) {
    // [LAW:dataflow-not-control-flow] Duplicate bootstrap requests are treated
    // as idempotent handshake replays; worker state stays on one canonical path.
    postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
    return;
  }
  if (bootstrapInFlight) {
    // [LAW:single-enforcer] Bootstrap orchestration is serialized at this
    // worker boundary so WASM init cannot execute concurrently.
    return;
  }
  bootstrapInFlight = true;
  try {
  await initRustRendererWasm();
  await initRustRendererEngine(message.canvas, message.config);
  attachRustRendererSharedInput(message.sharedInput);
  attachRustRendererSharedShapeBank(message.sharedShapeBank);
  attachRustRendererSharedSinkTable(message.sharedSinkTable);
  bootstrapped = true;
  deviceLostNotified = false;
  startRuntimePolling();
  postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
  } finally {
    bootstrapInFlight = false;
  }
}

async function handleRebuildGpuPipelines(
  message: Extract<RustRendererWorkerInboundMessage, { type: 'REBUILD_GPU_PIPELINES' }>,
): Promise<void> {
  if (message.passes.length === 0) {
    throw new Error('Rust worker rebuild contract violation: REBUILD_GPU_PIPELINES requires at least one pass');
  }
  await rebuildRustRendererGpuPipelines(message.passes);
  postWorkerMessage({ type: 'REBUILD_GPU_PIPELINES_SUCCESS' });
}

function handleResize(message: Extract<RustRendererWorkerInboundMessage, { type: 'RESIZE_CANVAS' }>): void {
  if (!isPositiveInt(message.width) || !isPositiveInt(message.height)) {
    throw new Error(
      `Rust worker resize contract violation: width/height must be positive integers (width=${String(message.width)}, height=${String(message.height)})`,
    );
  }
  resizeRustRendererSurface(message.width, message.height);
}

function handlePause(): void {
  pauseRustRendererEngine();
}

function handleResume(): void {
  resumeRustRendererEngine();
}

function handleInjectPoisonAlloc(): void {
  injectRustRendererPoisonAlloc();
}

function stopRuntimePolling(): void {
  if (runtimePollTimer !== null) {
    clearInterval(runtimePollTimer);
    runtimePollTimer = null;
  }
}

function startRuntimePolling(): void {
  if (runtimePollTimer !== null) return;
  // [LAW:single-enforcer] Rust scheduler owns lifecycle/timing state; worker
  // polling relays that packet and never re-derives runtime health locally.
  runtimePollTimer = setInterval(() => {
    try {
      const rawPacket = takeRustRendererFramePacingPacket();
      if (rawPacket == null) {
        return;
      }
      const packet = parseSchedulerPacket(rawPacket);
      if (packet) {
        postWorkerMessage(toOutboundHeartbeat(packet.heartbeat));
        if (packet.heartbeat.state === 'Lost') {
          postDeviceLost('scheduler_lost', 'Rust scheduler entered Lost state');
        }
        for (const rawEvent of packet.events) {
          const event = toOutboundRuntimeEvent(rawEvent);
          postWorkerMessage(event);
          if (event.state === 'Lost') {
            postDeviceLost(event.code, event.message);
          }
        }
        return;
      }
      postWorkerFatalError('scheduler_packet_invalid', 'Rust worker received invalid scheduler observability payload');
    } catch (error) {
      postWorkerFatalError(
        'runtime_poll_failure',
        `Rust worker runtime poll failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, POLL_INTERVAL_MS);
}

self.onmessage = (event: MessageEvent<RustRendererWorkerInboundMessage>) => {
  const message = event.data;
  if (!message) return;
  if (message.type === 'SHUTDOWN') {
    stopRuntimePolling();
    self.close();
    return;
  }
  if (message.type === 'PAUSE') {
    try {
      handlePause();
    } catch (error) {
      postWorkerFatalError(
        'pause_failure',
        `Rust worker pause failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }
  if (message.type === 'RESUME') {
    try {
      handleResume();
    } catch (error) {
      postWorkerFatalError(
        'resume_failure',
        `Rust worker resume failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }
  if (message.type === 'INJECT_POISON_ALLOC') {
    handleInjectPoisonAlloc();
    return;
  }
  if (message.type === 'RESIZE_CANVAS') {
    try {
      handleResize(message);
    } catch (error) {
      postWorkerFatalError(
        'resize_failure',
        `Rust worker resize failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }
  if (message.type === 'REBUILD_GPU_PIPELINES') {
    void handleRebuildGpuPipelines(message).catch((error) => {
      const prefix = bootstrapped ? 'Rust worker pipeline rebuild failure' : 'Rust worker rebuild before bootstrap';
      postWorkerFatalError('pipeline_rebuild_failure', `${prefix}: ${error instanceof Error ? error.message : String(error)}`);
    });
    return;
  }
  if (message.type === 'BOOTSTRAP') {
    void handleBootstrap(message).catch((error) => {
      const prefix = bootstrapped ? 'Rust worker runtime failure' : 'Rust worker bootstrap failure';
      postWorkerFatalError('bootstrap_failure', `${prefix}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
};
