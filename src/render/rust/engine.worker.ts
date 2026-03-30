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

const POLL_INTERVAL_MS = 250;

let bootstrapped = false;
let bootstrapInFlight = false;
let runtimePollTimer: ReturnType<typeof setInterval> | null = null;
let deviceLostNotified = false;
let runtimePollFatalNotified = false;
let telemetryEnabled = false;

// Heartbeat shared buffer views for zero-overhead health monitoring.
let heartbeatSignalWords: Int32Array | null = null;
let heartbeatFloatWords: Float32Array | null = null;

function postWorkerMessage(message: RustRendererWorkerOutboundMessage): void {
  self.postMessage(message);
}

function postWorkerFatalError(code: string, message: string): void {
  postWorkerMessage({ type: 'FATAL_ERROR', code, message });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function handleBootstrap(
  message: Extract<RustRendererWorkerInboundMessage, { type: 'BOOTSTRAP' }>,
): Promise<void> {
  if (bootstrapped) {
    postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
    return;
  }
  if (bootstrapInFlight) {
    return;
  }
  bootstrapInFlight = true;
  try {
    await initRustRendererWasm(message.rendererWasmBytes);
    const initialWidth = Math.max(1, Math.floor(message.initialWidth || 1));
    const initialHeight = Math.max(1, Math.floor(message.initialHeight || 1));
    await initRustRendererEngine(message.canvas, message.config, initialWidth, initialHeight);

    // Set up heartbeat SharedArrayBuffer views.
    heartbeatSignalWords = new Int32Array(message.sharedHeartbeat, 0, HEARTBEAT_SIGNAL_WORDS);
    heartbeatFloatWords = new Float32Array(
      message.sharedHeartbeat,
      HEARTBEAT_SIGNAL_WORDS * Int32Array.BYTES_PER_ELEMENT,
      HEARTBEAT_FLOAT_WORDS,
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

function handleInstallPipeline(
  message: Extract<RustRendererWorkerInboundMessage, { type: 'INSTALL_PIPELINE' }>,
): void {
  const pollingWasActive = runtimePollTimer !== null;
  if (pollingWasActive) {
    stopRuntimePolling();
  }
  try {
    const receiptJson = installRustRendererPipeline(message.payloadJson);
    // Parse receipt to check status
    let receipt: { status?: string };
    try {
      receipt = JSON.parse(receiptJson) as { status?: string };
    } catch {
      postWorkerMessage({
        type: 'INSTALL_PIPELINE_FAILURE',
        receiptJson,
      });
      return;
    }
    if (receipt.status === 'success') {
      postWorkerMessage({ type: 'INSTALL_PIPELINE_SUCCESS', receiptJson });
    } else {
      postWorkerMessage({ type: 'INSTALL_PIPELINE_FAILURE', receiptJson });
    }
  } catch (error) {
    const errorReceipt = JSON.stringify({
      status: 'error',
      compilationTimeMs: 0,
      diagnostics: [{
        severity: 'fatal',
        phase: 'manifest_allocation',
        message: toErrorMessage(error),
      }],
    });
    postWorkerMessage({ type: 'INSTALL_PIPELINE_FAILURE', receiptJson: errorReceipt });
  } finally {
    if (pollingWasActive) {
      startRuntimePolling();
    }
  }
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
  if (runtimePollTimer !== null) {
    return;
  }
  runtimePollFatalNotified = false;
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

      if (telemetryEnabled) {
        postWorkerMessage(packet.heartbeat);
      }
    } catch (error) {
      postRuntimePollFatalError(
        'runtime_poll_failure',
        `Rust worker runtime poll failure: ${toErrorMessage(error)}`,
      );
    }
  }, POLL_INTERVAL_MS);
}

function parseRuntimeSchedulerPacket(rawPacket: unknown): ReturnType<typeof parseSchedulerPacket> | null {
  try {
    return parseSchedulerPacket(rawPacket);
  } catch (error) {
    postRuntimePollFatalError(
      'scheduler_packet_invalid',
      `Rust worker received invalid scheduler observability payload: ${toErrorMessage(error)}`,
    );
    return null;
  }
}

function writeHeartbeatToSharedBuffer(
  heartbeat: ReturnType<typeof parseSchedulerPacket>['heartbeat'],
): void {
  if (!heartbeatFloatWords || !heartbeatSignalWords) {
    postRuntimePollFatalError(
      'heartbeat_shared_buffer_missing',
      'Rust worker is missing SharedArrayBuffer heartbeat views; cannot publish scheduler heartbeat.',
    );
    return;
  }
  const stateCode = HEARTBEAT_STATE_MAP[heartbeat.state as RustRendererSchedulerState] ?? 0;
  heartbeatFloatWords[HEARTBEAT_INDEX.state] = stateCode;
  heartbeatFloatWords[HEARTBEAT_INDEX.frameCount] = heartbeat.frameCount;
  heartbeatFloatWords[HEARTBEAT_INDEX.lastSuccessMs] = heartbeat.lastSuccessMs;
  // Sequence is the release fence — must be written last.
  Atomics.store(heartbeatSignalWords, HEARTBEAT_SIGNAL_INDEX, heartbeat.sequence);
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
  INSTALL_PIPELINE: (message) => {
    withFatalBoundary('install_pipeline_failure', 'Rust worker install pipeline failure', () => {
      handleInstallPipeline(message as Extract<InboundMessage, { type: 'INSTALL_PIPELINE' }>);
    });
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
  const payload = event.data;
  if (isEngineErrorPayload(payload)) {
    postWorkerMessage(payload);
  }
});
