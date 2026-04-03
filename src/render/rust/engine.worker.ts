/// <reference lib="webworker" />

import {
  injectRustRendererPoisonAlloc,
  initRustRendererEngine,
  initRustRendererWasm,
  installRustRendererPipeline,
  pauseRustRendererEngine,
  resumeRustRendererEngine,
  takeRustRendererFramePacingPacket,
} from '../wasm/oscilla_rust_renderer';
import { parseSchedulerPacket } from './engine-telemetry';
import {
  HEARTBEAT_SIGNAL_INDEX,
  HEARTBEAT_INDEX,
  HEARTBEAT_STATE_MAP,
  HEARTBEAT_SIGNAL_WORDS,
  HEARTBEAT_FLOAT_WORDS,
} from './runtime-input-layout';
import type {
  RustRendererEngineError,
  RustRendererWorkerInboundMessage,
  RustRendererWorkerOutboundMessage,
  RustRendererSchedulerState,
} from './worker-protocol';
import { PipelineInstallPayloadSchema } from './boundary-contract';

// ---------------------------------------------------------------------------
// Worker state — one object, all fields visible together
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 250;

// [LAW:one-source-of-truth] All mutable worker state lives in one place.
const state = {
  bootstrapped: false,
  bootstrapInFlight: false,
  telemetryEnabled: false,
  deviceLostNotified: false,
  runtimePollFatalNotified: false,
  pollTimer: null as ReturnType<typeof setInterval> | null,
  heartbeatSignalWords: null as Int32Array | null,
  heartbeatFloatWords: null as Float32Array | null,
};

// ---------------------------------------------------------------------------
// Message utilities
// ---------------------------------------------------------------------------

function postWorkerMessage(message: RustRendererWorkerOutboundMessage): void {
  self.postMessage(message);
}

function postWorkerFatalError(code: string, message: string): void {
  postWorkerMessage({ type: 'FATAL_ERROR', code, message });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function postDeviceLost(code: string, reason: string): void {
  if (state.deviceLostNotified) return;
  state.deviceLostNotified = true;
  postWorkerMessage({ type: 'DEVICE_LOST', code, reason });
}

// ---------------------------------------------------------------------------
// Polling lifecycle
// ---------------------------------------------------------------------------

function stopRuntimePolling(): void {
  if (state.pollTimer !== null) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startRuntimePolling(): void {
  if (state.pollTimer !== null) return;
  state.runtimePollFatalNotified = false;
  state.pollTimer = setInterval(pollTick, POLL_INTERVAL_MS);
}

function pollFatalError(code: string, message: string): void {
  if (state.runtimePollFatalNotified) return;
  state.runtimePollFatalNotified = true;
  stopRuntimePolling();
  postWorkerFatalError(code, message);
}

function pollTick(): void {
  try {
    const rawPacket = takeRustRendererFramePacingPacket();
    if (rawPacket == null) return;

    const packet = parseSchedulerPacket(rawPacket);

    writeHeartbeatToSharedBuffer(packet.heartbeat);

    for (const event of packet.events) {
      postWorkerMessage(event);
      if (event.state === 'Lost') {
        postDeviceLost(event.code, event.message);
      }
    }
    if (packet.heartbeat.state === 'Lost') {
      postDeviceLost('scheduler_lost', 'Rust scheduler entered Lost state');
    }

    if (state.telemetryEnabled) {
      postWorkerMessage(packet.heartbeat);
    }
  } catch (error) {
    pollFatalError(
      'runtime_poll_failure',
      `Rust worker runtime poll failure: ${toErrorMessage(error)}`,
    );
  }
}

function writeHeartbeatToSharedBuffer(
  heartbeat: ReturnType<typeof parseSchedulerPacket>['heartbeat'],
): void {
  if (!state.heartbeatFloatWords || !state.heartbeatSignalWords) {
    pollFatalError(
      'heartbeat_shared_buffer_missing',
      'Rust worker is missing SharedArrayBuffer heartbeat views; cannot publish scheduler heartbeat.',
    );
    return;
  }
  const stateCode = HEARTBEAT_STATE_MAP[heartbeat.state as RustRendererSchedulerState] ?? 0;
  state.heartbeatFloatWords[HEARTBEAT_INDEX.state] = stateCode;
  state.heartbeatFloatWords[HEARTBEAT_INDEX.frameCount] = heartbeat.frameCount;
  state.heartbeatFloatWords[HEARTBEAT_INDEX.lastSuccessMs] = heartbeat.lastSuccessMs;
  // Sequence is the release fence — must be written last.
  Atomics.store(state.heartbeatSignalWords, HEARTBEAT_SIGNAL_INDEX, heartbeat.sequence);
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

async function handleBootstrap(
  message: Extract<RustRendererWorkerInboundMessage, { type: 'BOOTSTRAP' }>,
): Promise<void> {
  if (state.bootstrapped) {
    postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
    return;
  }
  if (state.bootstrapInFlight) return;
  state.bootstrapInFlight = true;
  try {
    await initRustRendererWasm(message.rendererWasmBytes);
    const initialWidth = Math.max(1, Math.floor(message.initialWidth || 1));
    const initialHeight = Math.max(1, Math.floor(message.initialHeight || 1));
    await initRustRendererEngine(message.canvas, message.config, initialWidth, initialHeight);

    // Set up heartbeat SharedArrayBuffer views.
    state.heartbeatSignalWords = new Int32Array(message.sharedHeartbeat, 0, HEARTBEAT_SIGNAL_WORDS);
    state.heartbeatFloatWords = new Float32Array(
      message.sharedHeartbeat,
      HEARTBEAT_SIGNAL_WORDS * Int32Array.BYTES_PER_ELEMENT,
      HEARTBEAT_FLOAT_WORDS,
    );

    resumeRustRendererEngine();
    state.bootstrapped = true;
    state.deviceLostNotified = false;
    state.runtimePollFatalNotified = false;
    startRuntimePolling();
    postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
  } finally {
    state.bootstrapInFlight = false;
  }
}

// [LAW:dataflow-not-control-flow] Always pause → install → resume.
// No conditional save/restore of polling state. Same code path every time.
function handleInstallPipeline(
  message: Extract<RustRendererWorkerInboundMessage, { type: 'INSTALL_PIPELINE' }>,
): void {
  pauseRustRendererEngine();
  stopRuntimePolling();

  try {
    // [LAW:single-enforcer] Structural validation at the WASM boundary — the one
    // place where JS-produced payloads are checked before crossing into Rust.
    const parsed = PipelineInstallPayloadSchema.safeParse(JSON.parse(message.payloadJson));
    if (!parsed.success) {
      postWorkerMessage({
        type: 'INSTALL_PIPELINE_FAILURE',
        receiptJson: JSON.stringify({
          status: 'error',
          compilationTimeMs: 0,
          globalOffsetMap: {},
          framePayloadLength: 0,
          diagnostics: parsed.error.issues.map(issue => ({
            severity: 'error' as const,
            phase: 'manifest_allocation' as const,
            message: `${issue.path.join('.')}: ${issue.message}`,
          })),
        }),
      });
      return;
    }

    // parsed.data is guaranteed structurally valid — safe to serialize to Rust.
    const receiptJson = installRustRendererPipeline(JSON.stringify(parsed.data));
    let receipt: { status?: string };
    try {
      receipt = JSON.parse(receiptJson) as { status?: string };
    } catch {
      postWorkerMessage({ type: 'INSTALL_PIPELINE_FAILURE', receiptJson });
      return;
    }
    if (receipt.status === 'success') {
      postWorkerMessage({ type: 'INSTALL_PIPELINE_SUCCESS', receiptJson });
    } else {
      postWorkerMessage({ type: 'INSTALL_PIPELINE_FAILURE', receiptJson });
    }
  } catch (error) {
    postWorkerMessage({
      type: 'INSTALL_PIPELINE_FAILURE',
      receiptJson: JSON.stringify({
        status: 'error',
        compilationTimeMs: 0,
        diagnostics: [{
          severity: 'fatal',
          phase: 'manifest_allocation',
          message: toErrorMessage(error),
        }],
      }),
    });
  } finally {
    // Always resume — the Rust rAF loop re-arms from resume_engine.
    resumeRustRendererEngine();
    startRuntimePolling();
  }
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

function isEngineErrorPayload(payload: unknown): payload is RustRendererEngineError {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<RustRendererEngineError>;
  return (
    candidate.type === 'ENGINE_ERROR'
    && typeof candidate.source === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.location === 'string'
    && typeof candidate.fatal === 'boolean'
  );
}

// [LAW:single-enforcer] One dispatch table, one error boundary at the top.
// Async handlers (BOOTSTRAP) manage their own rejection via .catch().
const INBOUND_HANDLERS: {
  [K in RustRendererWorkerInboundMessage['type']]: (
    message: Extract<RustRendererWorkerInboundMessage, { type: K }>,
  ) => void;
} = {
  SHUTDOWN: () => {
    stopRuntimePolling();
    self.close();
  },
  PAUSE: () => pauseRustRendererEngine(),
  RESUME: () => resumeRustRendererEngine(),
  INJECT_POISON_ALLOC: () => injectRustRendererPoisonAlloc(),
  SET_TELEMETRY_ENABLED: (message) => { state.telemetryEnabled = message.enabled; },
  INSTALL_PIPELINE: handleInstallPipeline,
  BOOTSTRAP: (message) => {
    void handleBootstrap(message).catch((error) => {
      postWorkerFatalError('bootstrap_failure', `Rust worker bootstrap failure: ${toErrorMessage(error)}`);
    });
  },
};

self.onmessage = (event: MessageEvent<RustRendererWorkerInboundMessage>) => {
  const message = event.data;
  if (!message) return;
  try {
    // Type-safe dispatch: the handler table narrows message to its specific type.
    const handler = INBOUND_HANDLERS[message.type] as (message: RustRendererWorkerInboundMessage) => void;
    handler(message);
  } catch (error) {
    postWorkerFatalError(
      `${message.type.toLowerCase()}_failure`,
      `Rust worker ${message.type} failure: ${toErrorMessage(error)}`,
    );
  }
};

// Engine errors arrive via a separate postMessage from the WASM error callback.
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const payload = event.data;
  if (isEngineErrorPayload(payload)) {
    postWorkerMessage(payload);
  }
});
