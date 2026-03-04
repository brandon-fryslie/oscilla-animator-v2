/// <reference lib="webworker" />

import {
  attachRustRendererSharedInput,
  injectRustRendererPoisonAlloc,
  initRustRendererEngine,
  initRustRendererWasm,
  pauseRustRendererEngine,
  rebuildRustRendererSimulationPipeline,
  resumeRustRendererEngine,
  resizeRustRendererSurface,
  syncRustRendererRenderPayload,
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
}

interface RawRuntimeEvent {
  readonly severity: string;
  readonly code: string;
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
  );
}

function isRawRuntimeEvent(value: unknown): value is RawRuntimeEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<RawRuntimeEvent>;
  return (
    typeof event.severity === 'string'
    && typeof event.code === 'string'
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
  };
}

function toOutboundRuntimeEvent(raw: RawRuntimeEvent): RustRendererRuntimeEvent {
  return {
    type: 'RUNTIME_EVENT',
    severity: asRuntimeSeverity(raw.severity),
    code: raw.code,
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
  bootstrapped = true;
  deviceLostNotified = false;
  startRuntimePolling();
  postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
  } finally {
    bootstrapInFlight = false;
  }
}

async function handleRebuildSimulation(
  message: Extract<RustRendererWorkerInboundMessage, { type: 'REBUILD_SIMULATION_PIPELINE' }>,
): Promise<void> {
  await rebuildRustRendererSimulationPipeline(message.simulationWgsl);
  postWorkerMessage({ type: 'REBUILD_SIMULATION_PIPELINE_SUCCESS' });
}

async function handleSyncRenderPayload(
  message: Extract<RustRendererWorkerInboundMessage, { type: 'SYNC_RENDER_PAYLOAD' }>,
): Promise<void> {
  // [LAW:one-source-of-truth] Render payload marshalling is owned by one
  // worker boundary so Rust hot-path buffers receive one canonical schema.
  await syncRustRendererRenderPayload(
    message.topologyWords,
    message.instanceFloats,
    message.indirectArgsWords,
    message.vertexFloats,
    message.indexWords,
    message.drawRecordCount,
  );
}

function handleResize(message: Extract<RustRendererWorkerInboundMessage, { type: 'RESIZE_CANVAS' }>): void {
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
  if (message.type === 'SYNC_RENDER_PAYLOAD') {
    void handleSyncRenderPayload(message).catch((error) => {
      postWorkerFatalError(
        'render_payload_sync_failure',
        `Rust worker render payload sync failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
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
  if (message.type === 'REBUILD_SIMULATION_PIPELINE') {
    void handleRebuildSimulation(message).catch((error) => {
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
