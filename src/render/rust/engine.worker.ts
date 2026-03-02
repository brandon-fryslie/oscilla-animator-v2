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
  RustRendererWorkerInboundMessage,
  RustRendererWorkerOutboundMessage,
} from './worker-protocol';

let bootstrapped = false;
let runtimePollTimer: ReturnType<typeof setInterval> | null = null;

function postWorkerMessage(message: RustRendererWorkerOutboundMessage): void {
  self.postMessage(message);
}

async function handleBootstrap(message: Extract<RustRendererWorkerInboundMessage, { type: 'BOOTSTRAP' }>): Promise<void> {
  await initRustRendererWasm();
  await initRustRendererEngine(message.canvas, message.config);
  attachRustRendererSharedInput(message.sharedInput);
  bootstrapped = true;
  startRuntimePolling();
  postWorkerMessage({ type: 'BOOTSTRAP_SUCCESS' });
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
}

function handleResume(): void {
  resumeRustRendererEngine();
}

function handleInjectPoisonAlloc(): void {
  injectRustRendererPoisonAlloc();
}

function startRuntimePolling(): void {
  if (runtimePollTimer !== null) {
    return;
  }
  runtimePollTimer = setInterval(() => {
    try {
      const eventCode = takeRustRendererRuntimeEventCode();
      if (eventCode === 1) {
        postWorkerMessage({
          type: 'DEVICE_LOST',
          reason: 'surface_lost',
        });
      } else if (eventCode === 2) {
        postWorkerMessage({
          type: 'FATAL_ERROR',
          message: 'Rust worker fatal surface error',
        });
      }

      const packet = takeRustRendererFramePacingPacket();
      if (
        packet
        && typeof packet === 'object'
        && 'meanMs' in packet
        && 'stdDevMs' in packet
        && 'sampleCount' in packet
        && 'frameCount' in packet
      ) {
        const payload = packet as {
          meanMs: number;
          stdDevMs: number;
          sampleCount: number;
          frameCount: number;
        };
        postWorkerMessage({
          type: 'RUNTIME_TELEMETRY',
          meanMs: payload.meanMs,
          stdDevMs: payload.stdDevMs,
          sampleCount: payload.sampleCount,
          frameCount: payload.frameCount,
        });
      }
    } catch (error) {
      postWorkerMessage({
        type: 'FATAL_ERROR',
        message: `Rust worker runtime poll failure: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, 250);
}

self.onmessage = (event: MessageEvent<RustRendererWorkerInboundMessage>) => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.type === 'SHUTDOWN') {
    if (runtimePollTimer !== null) {
      clearInterval(runtimePollTimer);
      runtimePollTimer = null;
    }
    self.close();
    return;
  }
  if (message.type !== 'BOOTSTRAP') {
    if (message.type === 'PAUSE') {
      try {
        handlePause();
      } catch (error) {
        postWorkerMessage({
          type: 'FATAL_ERROR',
          message: `Rust worker pause failure: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      return;
    }
    if (message.type === 'RESUME') {
      try {
        handleResume();
      } catch (error) {
        postWorkerMessage({
          type: 'FATAL_ERROR',
          message: `Rust worker resume failure: ${error instanceof Error ? error.message : String(error)}`,
        });
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
        postWorkerMessage({
          type: 'FATAL_ERROR',
          message: `Rust worker resize failure: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      return;
    }
    if (message.type !== 'REBUILD_PIPELINE') {
      return;
    }
    void handleRebuild(message).catch((error) => {
      const prefix = bootstrapped ? 'Rust worker pipeline rebuild failure' : 'Rust worker rebuild before bootstrap';
      postWorkerMessage({
        type: 'FATAL_ERROR',
        message: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
    return;
  }
  void handleBootstrap(message).catch((error) => {
    const prefix = bootstrapped ? 'Rust worker runtime failure' : 'Rust worker bootstrap failure';
    postWorkerMessage({
      type: 'FATAL_ERROR',
      message: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
    });
  });
};
