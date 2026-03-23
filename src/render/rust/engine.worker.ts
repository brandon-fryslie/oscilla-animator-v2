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
  takeRustRendererFramePacingPacket,
  takeRustRendererReadbackSnapshot,
  uploadRustRendererAtlasData,
} from '../wasm/oscilla_rust_renderer';
import { isPositiveInt, parseSchedulerPacket } from './engine-telemetry';
import {
  RUNTIME_INPUT_SIGNAL_WORDS,
  RUNTIME_INPUT_FLOAT_WORDS,
  HEARTBEAT_SIGNAL_INDEX,
  HEARTBEAT_INDEX,
  HEARTBEAT_STATE_MAP,
} from './runtime-input-layout';
import type {
  RustRendererEngineError,
  RustRendererIndirectArgsRecord,
  RustRendererReadbackSnapshot,
  RustRendererRebuildGpuPipelinesFailure,
  RustRendererWorkerInboundMessage,
  RustRendererWorkerOutboundMessage,
  RustRendererSchedulerState,
} from './worker-protocol';

const POLL_INTERVAL_MS = 250;

let bootstrapped = false;
let bootstrapInFlight = false;
let runtimePollTimer: ReturnType<typeof setInterval> | null = null;
let deviceLostNotified = false;
let runtimePollFatalNotified = false;
let telemetryEnabled = false;

// Shared buffer views for zero-overhead heartbeat channel.
// Set during bootstrap; the worker writes heartbeat state here instead
// of postMessage-ing it, so the main-thread circuit breaker can read
// directly with no serialization or message-event overhead.
let heartbeatSignalWords: Int32Array | null = null;
let heartbeatFloatWords: Float32Array | null = null;

function postWorkerMessage(message: RustRendererWorkerOutboundMessage): void {
  self.postMessage(message);
}

function postWorkerFatalError(code: string, message: string): void {
  postWorkerMessage({ type: 'FATAL_ERROR', code, message });
}

function postPipelineRebuildFailure(code: string, passId: string, message: string): void {
  const payload: RustRendererRebuildGpuPipelinesFailure = {
    type: 'REBUILD_GPU_PIPELINES_FAILURE',
    code,
    passId,
    message,
  };
  postWorkerMessage(payload);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPipelineRebuildFailurePayload(
  payload: unknown,
): payload is { readonly code: string; readonly passId: string; readonly message: string } {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload as Partial<{ readonly code: string; readonly passId: string; readonly message: string }>;
  return (
    typeof candidate.code === 'string'
    && typeof candidate.passId === 'string'
    && typeof candidate.message === 'string'
  );
}

function postRuntimePollFatalError(code: string, message: string): void {
  if (runtimePollFatalNotified) {
    return;
  }
  runtimePollFatalNotified = true;
  stopRuntimePolling();
  postWorkerFatalError(code, message);
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

function isEngineErrorPayload(payload: unknown): payload is RustRendererEngineError {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload as Partial<RustRendererEngineError>;
  return (
    candidate.type === 'ENGINE_ERROR'
    && typeof candidate.source === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.location === 'string'
    && typeof candidate.fatal === 'boolean'
  );
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
    await initRustRendererWasm(message.rendererWasmBytes);
    // [LAW:one-source-of-truth] Initial surface dimensions come from the
    // bootstrap message so the engine starts with a valid surface size.
    // Subsequent resizes are driven by the shared input buffer in tick().
    const initialWidth = Math.max(1, Math.floor(message.initialWidth || 1));
    const initialHeight = Math.max(1, Math.floor(message.initialHeight || 1));
    await initRustRendererEngine(message.canvas, message.config, initialWidth, initialHeight);
    attachRustRendererSharedInput(message.sharedInput);
    attachRustRendererSharedShapeBank(message.sharedShapeBank);
    attachRustRendererSharedSinkTable(message.sharedSinkTable);
    // Capture shared buffer views for heartbeat channel.
    heartbeatSignalWords = new Int32Array(message.sharedInput, 0, RUNTIME_INPUT_SIGNAL_WORDS);
    heartbeatFloatWords = new Float32Array(
      message.sharedInput,
      RUNTIME_INPUT_SIGNAL_WORDS * Int32Array.BYTES_PER_ELEMENT,
      RUNTIME_INPUT_FLOAT_WORDS,
    );
    resumeRustRendererEngine();
    bootstrapped = true;
    deviceLostNotified = false;
    runtimePollFatalNotified = false;
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
  // [LAW:single-enforcer] Worker polling owns frame-pacing/readback drains;
  // rebuild temporarily swaps engine ownership in WASM, so pause polling to
  // keep pacing reads from racing that transition.
  const pollingWasActive = runtimePollTimer !== null;
  if (pollingWasActive) {
    stopRuntimePolling();
  }
  try {
    await rebuildRustRendererGpuPipelines(message.passes);
  } catch (error) {
    if (isPipelineRebuildFailurePayload(error)) {
      postPipelineRebuildFailure(error.code, error.passId, error.message);
      return;
    }
    throw error;
  } finally {
    if (pollingWasActive) {
      startRuntimePolling();
    }
  }
  postWorkerMessage({ type: 'REBUILD_GPU_PIPELINES_SUCCESS' });
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

// [RECOVER-11] Upload MSDF atlas data for Type5 text rendering.
function handleUploadAtlas(message: Extract<RustRendererWorkerInboundMessage, { type: 'UPLOAD_ATLAS' }>): void {
  uploadRustRendererAtlasData(message.data);
}

function stopRuntimePolling(): void {
  if (runtimePollTimer !== null) {
    clearInterval(runtimePollTimer);
    runtimePollTimer = null;
  }
}

function startRuntimePolling(): void {
  if (runtimePollTimer !== null) {
    return;
  }
  runtimePollFatalNotified = false;
  // TODO(#161): Keep worker polling boundary-only; move remaining telemetry
  // orchestration/helpers out of this file into dedicated telemetry modules.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/161
  // [LAW:single-enforcer] Rust scheduler owns lifecycle/timing state; worker
  // polling relays that packet and never re-derives runtime health locally.
  runtimePollTimer = setInterval(() => {
    try {
      const rawPacket = takeRustRendererFramePacingPacket();
      if (rawPacket == null) {
        return;
      }
      const packet = parseRuntimeSchedulerPacket(rawPacket);
      if (packet === null) {
        return;
      }

      // Write heartbeat to SharedArrayBuffer — zero postMessage overhead.
      // Main-thread circuit breaker reads this directly via Atomics.
      writeHeartbeatToSharedBuffer(packet.heartbeat);

      // Runtime events (Lost state, errors) still need postMessage since
      // the main thread must react to them immediately.
      for (const event of packet.events) {
        postWorkerMessage(event);
        if (event.state === 'Lost') {
          postDeviceLost(event.code, event.message);
        }
      }
      if (packet.heartbeat.state === 'Lost') {
        postDeviceLost('scheduler_lost', 'Rust scheduler entered Lost state');
      }

      // Full telemetry via postMessage only when debug mode is active.
      if (telemetryEnabled) {
        postWorkerMessage(packet.heartbeat);
      }
    } catch (error) {
      postRuntimePollFatalError(
        'runtime_poll_failure',
        `Rust worker runtime poll failure: ${toErrorMessage(error)}`,
      );
    }
    // Readback snapshots: only when telemetry is enabled (debug mode).
    if (telemetryEnabled) {
      try {
        const rawSnapshot = takeRustRendererReadbackSnapshot();
        if (rawSnapshot != null) {
          const snapshot = parseReadbackSnapshot(rawSnapshot);
          if (snapshot !== null) {
            postWorkerMessage(snapshot);
          }
        }
      } catch {
        // Readback failures are non-fatal; the next poll will retry.
      }
    }
  }, POLL_INTERVAL_MS);
}

function parseRuntimeSchedulerPacket(rawPacket: unknown): ReturnType<typeof parseSchedulerPacket> | null {
  try {
    // [LAW:single-enforcer] Packet contract validation is enforced at the
    // telemetry parser boundary, not duplicated at worker callsites.
    return parseSchedulerPacket(rawPacket);
  } catch (error) {
    postRuntimePollFatalError(
      'scheduler_packet_invalid',
      `Rust worker received invalid scheduler observability payload: ${toErrorMessage(error)}`,
    );
    return null;
  }
}

// Write heartbeat fields to the SharedArrayBuffer so the main-thread
// circuit breaker can read them with zero postMessage overhead.
// Data words are written first, then the sequence is stored atomically
// to signal word index 1 — providing an acquire/release fence so the
// main thread always reads a consistent snapshot.
function writeHeartbeatToSharedBuffer(
  heartbeat: ReturnType<typeof parseSchedulerPacket>['heartbeat'],
): void {
  if (!heartbeatFloatWords || !heartbeatSignalWords) return;
  const stateCode = HEARTBEAT_STATE_MAP[heartbeat.state as RustRendererSchedulerState] ?? 0;
  // Data words (release-ordered via the atomic store below).
  heartbeatFloatWords[HEARTBEAT_INDEX.state] = stateCode;
  heartbeatFloatWords[HEARTBEAT_INDEX.frameCount] = heartbeat.frameCount;
  heartbeatFloatWords[HEARTBEAT_INDEX.lastSuccessMs] = heartbeat.lastSuccessMs;
  // Sequence is the release fence — must be written last.
  Atomics.store(heartbeatSignalWords, HEARTBEAT_SIGNAL_INDEX, heartbeat.sequence);
}

// [RECOVER-10] Parse raw JS readback snapshot from Rust into typed message.
function parseReadbackSnapshot(raw: unknown): RustRendererReadbackSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.frameCount !== 'number' || typeof candidate.capturedAtMs !== 'number') {
    return null;
  }
  const rawArgs = candidate.indirectArgs;
  const indirectArgs: RustRendererIndirectArgsRecord[] = [];
  if (Array.isArray(rawArgs)) {
    for (const entry of rawArgs) {
      if (entry && typeof entry === 'object') {
        const r = entry as Record<string, unknown>;
        indirectArgs.push({
          indexCount: typeof r.indexCount === 'number' ? r.indexCount : 0,
          instanceCount: typeof r.instanceCount === 'number' ? r.instanceCount : 0,
          firstIndex: typeof r.firstIndex === 'number' ? r.firstIndex : 0,
          baseVertex: typeof r.baseVertex === 'number' ? r.baseVertex : 0,
          firstInstance: typeof r.firstInstance === 'number' ? r.firstInstance : 0,
        });
      }
    }
  }
  const instanceProbeValues = candidate.instanceProbeValues instanceof Float32Array
    ? candidate.instanceProbeValues
    : new Float32Array(0);
  return {
    type: 'READBACK_SNAPSHOT',
    frameCount: candidate.frameCount as number,
    capturedAtMs: candidate.capturedAtMs as number,
    indirectArgs,
    instanceProbeValues,
  };
}

function withFatalBoundary(code: string, prefix: string, operation: () => void): void {
  try {
    operation();
  } catch (error) {
    postWorkerFatalError(code, `${prefix}: ${toErrorMessage(error)}`);
  }
}

function withAsyncFatalBoundary(code: string, prefix: string, operation: () => Promise<void>): void {
  void operation().catch((error) => {
    postWorkerFatalError(code, `${prefix}: ${toErrorMessage(error)}`);
  });
}

type InboundMessage = RustRendererWorkerInboundMessage;
type InboundMessageType = InboundMessage['type'];
type InboundHandler = (message: InboundMessage) => void;

const INBOUND_HANDLERS: Record<InboundMessageType, InboundHandler> = {
  SHUTDOWN: () => {
    stopRuntimePolling();
    self.close();
  },
  PAUSE: () => {
    withFatalBoundary('pause_failure', 'Rust worker pause failure', handlePause);
  },
  RESUME: () => {
    withFatalBoundary('resume_failure', 'Rust worker resume failure', handleResume);
  },
  INJECT_POISON_ALLOC: () => {
    handleInjectPoisonAlloc();
  },
  SET_TELEMETRY_ENABLED: (message) => {
    telemetryEnabled = (message as Extract<InboundMessage, { type: 'SET_TELEMETRY_ENABLED' }>).enabled;
  },
  // [RECOVER-11] Atlas upload for Type5 MSDF text.
  UPLOAD_ATLAS: (message) => {
    withFatalBoundary('atlas_upload_failure', 'Rust worker atlas upload failure', () => {
      handleUploadAtlas(message as Extract<InboundMessage, { type: 'UPLOAD_ATLAS' }>);
    });
  },
  REBUILD_GPU_PIPELINES: (message) => {
    withAsyncFatalBoundary('pipeline_rebuild_failure', 'Rust worker pipeline rebuild failure', () => (
      handleRebuildGpuPipelines(message as Extract<InboundMessage, { type: 'REBUILD_GPU_PIPELINES' }>)
    ));
  },
  BOOTSTRAP: (message) => {
    withAsyncFatalBoundary('bootstrap_failure', 'Rust worker bootstrap failure', () => (
      handleBootstrap(message as Extract<InboundMessage, { type: 'BOOTSTRAP' }>)
    ));
  },
};

self.onmessage = (event: MessageEvent<RustRendererWorkerInboundMessage>) => {
  const message = event.data;
  if (!message) {
    return;
  }
  INBOUND_HANDLERS[message.type](message);
};

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  // [LAW:single-enforcer] Engine worker is the canonical boundary that forwards
  // structured engine-fault payloads from the wasm/runtime side to the UI.
  const payload = event.data;
  if (isEngineErrorPayload(payload)) {
    postWorkerMessage(payload);
  }
});
