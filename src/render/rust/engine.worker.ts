/// <reference lib="webworker" />

import {
  attachRustRendererSharedArena,
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
import { isPositiveInt, parseSchedulerPacket } from './engine-telemetry';
import type {
  RustRendererEngineError,
  RustRendererWorkerInboundMessage,
  RustRendererWorkerOutboundMessage,
} from './worker-protocol';

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
    await initRustRendererWasm();
    await initRustRendererEngine(message.canvas, message.config);
    attachRustRendererSharedInput(message.sharedInput);
    attachRustRendererSharedArena(message.sharedArena);
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
      const packet = parseSchedulerPacket(rawPacket);
      if (packet) {
        postWorkerMessage(packet.heartbeat);
        if (packet.heartbeat.state === 'Lost') {
          postDeviceLost('scheduler_lost', 'Rust scheduler entered Lost state');
        }
        for (const event of packet.events) {
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
      postWorkerFatalError(
        'pipeline_rebuild_failure',
        `Rust worker pipeline rebuild failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    return;
  }
  if (message.type === 'BOOTSTRAP') {
    void handleBootstrap(message).catch((error) => {
      postWorkerFatalError(
        'bootstrap_failure',
        `Rust worker bootstrap failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
};

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  // [LAW:single-enforcer] Engine worker is the canonical boundary that forwards
  // structured engine-fault payloads from the wasm/runtime side to the UI.
  const payload = event.data;
  if (isEngineErrorPayload(payload)) {
    postWorkerMessage(payload);
  }
});
