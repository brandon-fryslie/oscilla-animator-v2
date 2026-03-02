/// <reference lib="webworker" />

import {
  attachRustRendererSharedInput,
  injectRustRendererPoisonAlloc,
  initRustRendererEngine,
  initRustRendererWasm,
  pauseRustRendererEngine,
  rebuildRustRendererPipeline,
  resumeRustRendererEngine,
  resizeRustRendererSurface,
  takeRustRendererFramePacingPacket,
  takeRustRendererRuntimeEventCode,
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

interface LegacyFramePacingPacket {
  readonly meanMs: number;
  readonly stdDevMs: number;
  readonly sampleCount: number;
  readonly frameCount: number;
}

const POLL_INTERVAL_MS = 250;

let bootstrapped = false;
let bootstrapInFlight = false;
let runtimePollTimer: ReturnType<typeof setInterval> | null = null;
let legacyHeartbeatSequence = 0;
let legacyState: RustRendererSchedulerState = 'Booting';

function postWorkerMessage(message: RustRendererWorkerOutboundMessage): void {
  self.postMessage(message);
}

function postWorkerFatalError(code: string, message: string): void {
  postWorkerMessage({ type: 'FATAL_ERROR', code, message });
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

function parseLegacyFramePacingPacket(packet: unknown): LegacyFramePacingPacket | null {
  if (!packet || typeof packet !== 'object') return null;
  const candidate = packet as Partial<LegacyFramePacingPacket>;
  if (
    !isFiniteNumber(candidate.meanMs)
    || !isFiniteNumber(candidate.stdDevMs)
    || !isFiniteNumber(candidate.sampleCount)
    || !isFiniteNumber(candidate.frameCount)
  ) {
    return null;
  }
  return {
    meanMs: candidate.meanMs,
    stdDevMs: candidate.stdDevMs,
    sampleCount: candidate.sampleCount,
    frameCount: candidate.frameCount,
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

function toLegacyHeartbeat(raw: LegacyFramePacingPacket): RustRendererSchedulerHeartbeat {
  legacyHeartbeatSequence += 1;
  if (legacyState === 'Booting') legacyState = 'Running';
  const now = Date.now();
  return {
    type: 'SCHEDULER_HEARTBEAT',
    state: legacyState,
    sequence: legacyHeartbeatSequence,
    emittedAtMs: now,
    frameCount: raw.frameCount,
    loopCount: raw.frameCount,
    meanTickMs: raw.meanMs,
    stdDevTickMs: raw.stdDevMs,
    sampleCount: raw.sampleCount,
    lastTickMs: now,
    lastSuccessMs: now,
  };
}

function emitLegacyRuntimeEvents(frameCount: number): void {
  const eventCode = takeRustRendererRuntimeEventCode();
  if (eventCode === 0) return;
  if (eventCode === 1) {
    legacyState = 'Lost';
    postWorkerMessage({
      type: 'RUNTIME_EVENT',
      severity: 'error',
      code: 'surface_lost',
      message: 'Surface acquire failed with Lost/Outdated',
      state: legacyState,
      frameCount,
      loopCount: frameCount,
      emittedAtMs: Date.now(),
    });
    return;
  }
  legacyState = 'Lost';
  postWorkerMessage({
    type: 'RUNTIME_EVENT',
    severity: 'fatal',
    code: 'surface_fatal',
    message: 'Rust worker fatal surface error',
    state: legacyState,
    frameCount,
    loopCount: frameCount,
    emittedAtMs: Date.now(),
  });
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
  legacyHeartbeatSequence = 0;
  legacyState = 'Booting';
  startRuntimePolling();
  postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
  } finally {
    bootstrapInFlight = false;
  }
}

async function handleRebuild(message: Extract<RustRendererWorkerInboundMessage, { type: 'REBUILD_PIPELINE' }>): Promise<void> {
  await rebuildRustRendererPipeline(
    message.simulationWgsl,
    message.assemblyWgsl,
    message.uberShaderWgsl,
    message.particleCount,
    message.shapeCount,
  );
  postWorkerMessage({ type: 'REBUILD_PIPELINE_SUCCESS' });
}

function handleResize(message: Extract<RustRendererWorkerInboundMessage, { type: 'RESIZE_CANVAS' }>): void {
  resizeRustRendererSurface(message.width, message.height);
}

function handlePause(): void {
  pauseRustRendererEngine();
  legacyState = 'Paused';
}

function handleResume(): void {
  resumeRustRendererEngine();
  if (legacyState === 'Paused') legacyState = 'Running';
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
        for (const rawEvent of packet.events) {
          const event = toOutboundRuntimeEvent(rawEvent);
          postWorkerMessage(event);
        }
        return;
      }
      const legacyPacket = parseLegacyFramePacingPacket(rawPacket);
      if (legacyPacket) {
        // [LAW:one-source-of-truth] exception: Legacy WASM builds emit the
        // previous frame pacing shape; fallback exists only until ABI rebuild.
        postWorkerMessage(toLegacyHeartbeat(legacyPacket));
        emitLegacyRuntimeEvents(legacyPacket.frameCount);
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
  if (message.type === 'REBUILD_PIPELINE') {
    void handleRebuild(message).catch((error) => {
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
