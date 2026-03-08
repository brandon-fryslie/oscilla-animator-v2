/// <reference lib="webworker" />

import type { CompiledProgramIR } from '../compiler/ir/program';
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DrawPrepSinkTableRecordWord,
  createInitialState,
  createRuntimeStateFromSession,
  createSessionState,
  migrateState,
  prepareStateWriteBank,
  reconcilePhaseOffsets,
  type RuntimeState,
  type SessionState,
} from '../runtime';
import { createDefaultRegistry } from '../runtime/kernels/default-registry';
import {
  RUNTIME_INPUT_FLOAT_WORDS,
  RUNTIME_INPUT_INDEX,
  RUNTIME_INPUT_SIGNAL_WORDS,
} from '../render/rust/runtime-input-layout';
import type { SerializableCompiledProgramIR } from './compile-worker-protocol';
import type {
  RuntimeExternalWrite,
  RuntimeHotpathWorkerInboundMessage,
  RuntimeHotpathWorkerOutboundMessage,
  RuntimeHotpathSinkTableSample,
} from './runtime-hotpath-worker-protocol';
import { buildRuntimeHotpathInstallPlanes } from './runtime-hotpath-install';

const DEFAULT_TICK_HZ = 60;
const HEARTBEAT_INTERVAL_MS = 500;
const MAX_UINT32 = 0xFFFF_FFFF;

interface ViewportState {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
}

let bootstrapped = false;
let disposed = false;
let paused = false;
let tickHz = DEFAULT_TICK_HZ;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let signalWords: Int32Array | null = null;
let inputWords: Float32Array | null = null;
let sharedShapeBankWords: Uint32Array | null = null;
let sharedSinkTableWords: Uint32Array | null = null;
let sessionState: SessionState | null = null;
let currentProgram: CompiledProgramIR | null = null;
let currentState: RuntimeState | null = null;
const pendingExternalWrites: RuntimeExternalWrite[] = [];
let frameCount = 0;
let tickWindowCount = 0;
let tickWindowTotalMs = 0;
let lastTickMs = 0;
let lastDrawOpCount = 0;
let lastSinkWordCount = 0;
let lastHeartbeatMs = 0;
let gpuDrivenExecutionEnabled = false;
let gpuDrivenSinkTableWords: Uint32Array | null = null;
let gpuDrivenSinkTableWordCount = 0;
let gpuDrivenShapeBankWords: Uint32Array | null = null;
let gpuDrivenShapeBankWordCount = 0;
let gpuDrivenPlanesDirty = false;
let publishedSinkWordCount = 0;
let publishedShapeWordCount = 0;
let lastSinkTableSample: RuntimeHotpathSinkTableSample | null = null;
let viewport: ViewportState = {
  width: 1,
  height: 1,
  zoom: 1,
  panX: 0,
  panY: 0,
};

function postMessageToMain(payload: RuntimeHotpathWorkerOutboundMessage): void {
  (self as DedicatedWorkerGlobalScope).postMessage(payload);
}

function postFatal(code: string, message: string): void {
  postMessageToMain({ type: 'FATAL', code, message });
}

function assertFiniteUint32(value: number, context: string): number {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_UINT32
  ) {
    throw new Error(`${context} must be a uint32 (got ${String(value)})`);
  }
  return value;
}

function coerceFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function reviveProgram(program: SerializableCompiledProgramIR): CompiledProgramIR {
  return {
    ...program,
    // [LAW:one-source-of-truth] Runtime worker reconstructs the canonical
    // kernel registry from one definition instead of receiving function refs.
    kernelRegistry: createDefaultRegistry(),
  };
}

function buildSinkTableSample(
  words: Uint32Array | null,
  sinkTableWordCount: number,
): RuntimeHotpathSinkTableSample | null {
  if (!words || sinkTableWordCount <= 0) return null;
  const headerWords = DRAW_PREP_SINK_TABLE_HEADER_WORDS;
  const recordWords = DRAW_PREP_SINK_TABLE_RECORD_WORDS;
  const totalRecords = words[1] ?? 0;
  const base = headerWords;
  const hasFirstRecord = totalRecords > 0 && sinkTableWordCount >= base + recordWords;
  return {
    sinkTableWordCount: sinkTableWordCount >>> 0,
    totalRecords: totalRecords >>> 0,
    firstRecord: hasFirstRecord
      ? {
        drawModeCode: words[base + DrawPrepSinkTableRecordWord.DrawMode] ?? 0,
        count: words[base + DrawPrepSinkTableRecordWord.Count] ?? 0,
        instanceCount: words[base + DrawPrepSinkTableRecordWord.InstanceCount] ?? 0,
        first: words[base + DrawPrepSinkTableRecordWord.First] ?? 0,
        baseVertex: words[base + DrawPrepSinkTableRecordWord.BaseVertex] ?? 0,
        firstInstance: words[base + DrawPrepSinkTableRecordWord.FirstInstance] ?? 0,
        shapeWordOffset: words[base + DrawPrepSinkTableRecordWord.ShapeWordOffset] ?? 0,
        materialId: words[base + DrawPrepSinkTableRecordWord.MaterialId] ?? 0,
      }
      : null,
  };
}

function installProgram(program: SerializableCompiledProgramIR): void {
  const revived = reviveProgram(program);
  const schedule = revived.schedule as {
    stateSlotCount?: number;
    stateMappings?: readonly any[];
    eventSlotCount?: number;
  };
  const stateSlotCount = schedule?.stateSlotCount ?? 0;
  const stateMappings = schedule?.stateMappings ?? [];
  const eventSlotCount = schedule?.eventSlotCount ?? 0;
  const valueExprCount = revived.valueExprs?.nodes.length ?? 0;

  if (!sessionState) {
    sessionState = createSessionState();
  }

  const nextState = createRuntimeStateFromSession(
    sessionState,
    stateSlotCount,
    eventSlotCount,
    valueExprCount,
    revived.arenaTotalFloats,
    undefined,
    undefined,
    revived.arenaRuntimeLayout,
  );

  if (currentProgram && currentState && stateMappings.length > 0) {
    const oldSchedule = currentProgram.schedule as { stateMappings?: readonly any[] };
    const oldStateMappings = oldSchedule?.stateMappings ?? [];
    const getLaneMapping = (instanceId: string) => sessionState!.continuity.mappings.get(instanceId) ?? null;
    migrateState(
      currentState.state,
      nextState.state,
      oldStateMappings,
      stateMappings,
      getLaneMapping,
    );
  } else if (stateMappings.length > 0) {
    const initial = createInitialState(stateSlotCount, stateMappings);
    nextState.state.set(initial);
  }

  prepareStateWriteBank(nextState);

  const oldTimeModel = currentProgram?.schedule?.timeModel;
  const newTimeModel = revived.schedule?.timeModel;
  if (oldTimeModel && newTimeModel) {
    reconcilePhaseOffsets(
      oldTimeModel,
      newTimeModel,
      sessionState.timeState.prevTMs ?? 0,
      sessionState.timeState,
    );
  }

  let installPlanes: ReturnType<typeof buildRuntimeHotpathInstallPlanes>;
  try {
    // [LAW:single-enforcer] Install-time runtime materialization + sink-table
    // packing are enforced through one service module boundary.
    installPlanes = buildRuntimeHotpathInstallPlanes(revived, nextState, performance.now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[runtime-hotpath] install materialization failed: ${message}`);
  }

  gpuDrivenExecutionEnabled = false;
  gpuDrivenSinkTableWords = null;
  gpuDrivenSinkTableWordCount = 0;
  lastSinkTableSample = null;
  gpuDrivenShapeBankWords = installPlanes.shapeBankWords;
  gpuDrivenShapeBankWordCount = installPlanes.shapeBankWordCount;
  publishedSinkWordCount = 0;
  publishedShapeWordCount = 0;
  gpuDrivenPlanesDirty = true;
  // TODO(steel-thread): Per-frame CPU payload execution path was deleted in
  // favor of one GPU-static sink/shape publication path. If a future compile
  // artifact cannot satisfy this contract, fail installation instead of
  // reintroducing runtime mode branching.
  // [LAW:no-mode-explosion] Canonical runtime execution keeps one mode.
  if (installPlanes.sinkTableWords) {
    gpuDrivenExecutionEnabled = true;
    gpuDrivenSinkTableWords = installPlanes.sinkTableWords;
    gpuDrivenSinkTableWordCount = installPlanes.sinkTableWordCount;
    lastSinkTableSample = buildSinkTableSample(
      installPlanes.sinkTableWords,
      installPlanes.sinkTableWordCount,
    );
  }
  if ((revived.drawPrepProgram?.sinks.length ?? 0) > 0 && !gpuDrivenExecutionEnabled) {
    // [LAW:one-source-of-truth] Draw-prep sink metadata must come from one
    // runtime-owned GPU table; no CPU fallback builder remains in hot loop.
    throw new Error('[runtime-hotpath] draw-prep program requires GPU sink-table metadata');
  }

  currentProgram = revived;
  currentState = nextState;
  pendingExternalWrites.length = 0;

  postMessageToMain({
    type: 'PROGRAM_INSTALLED',
    sinkCount: revived.drawPrepProgram?.sinks?.length ?? 0,
  });
}

function ensureTickLoop(): void {
  if (tickTimer !== null || disposed) return;
  const intervalMs = 1000 / Math.max(1, tickHz);
  // [LAW:dataflow-not-control-flow] Hot path runs continuously in fixed order;
  // data (counts/sinks/inputs) controls effect, not whether stages execute.
  tickTimer = setInterval(() => {
    try {
      tick();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postFatal('runtime_tick_failed', message);
      paused = true;
    }
  }, intervalMs);
}

function stopTickLoop(): void {
  if (tickTimer === null) return;
  clearInterval(tickTimer);
  tickTimer = null;
}

function flushExternalWrites(state: RuntimeState): void {
  if (pendingExternalWrites.length === 0) return;
  const bus = state.externalChannels.writeBus;
  for (const write of pendingExternalWrites) {
    if (write.op === 'set') {
      bus.set(write.name, write.v);
      continue;
    }
    if (write.op === 'pulse') {
      bus.pulse(write.name);
      continue;
    }
    bus.add(write.name, write.dv);
  }
  pendingExternalWrites.length = 0;
}

function publishGpuDrivenPlanesIfDirty(): void {
  if (!sharedShapeBankWords || !sharedSinkTableWords) {
    throw new Error('runtime shared planes are not attached');
  }
  if (!gpuDrivenPlanesDirty) {
    return;
  }
  const sinkWordCount = assertFiniteUint32(
    gpuDrivenExecutionEnabled ? gpuDrivenSinkTableWordCount : 0,
    'gpuDrivenSinkTable.wordCount',
  );
  if (sinkWordCount > sharedSinkTableWords.length) {
    throw new Error(
      `sink table capacity exceeded (wordCount=${sinkWordCount}, capacity=${sharedSinkTableWords.length})`,
    );
  }
  if (gpuDrivenExecutionEnabled && gpuDrivenSinkTableWords) {
    if (gpuDrivenSinkTableWords.length < sinkWordCount) {
      throw new Error(
        `gpu sink table shorter than wordCount (length=${gpuDrivenSinkTableWords.length}, wordCount=${sinkWordCount})`,
      );
    }
    if (sinkWordCount > 0) {
      sharedSinkTableWords.set(gpuDrivenSinkTableWords.subarray(0, sinkWordCount), 0);
    }
  }
  const shapeWordCount = assertFiniteUint32(
    gpuDrivenShapeBankWordCount,
    'gpuDrivenShapeBank.wordCount',
  );
  if (shapeWordCount > sharedShapeBankWords.length) {
    throw new Error(
      `shape bank capacity exceeded (wordCount=${shapeWordCount}, capacity=${sharedShapeBankWords.length})`,
    );
  }
  if (gpuDrivenShapeBankWords) {
    if (gpuDrivenShapeBankWords.length < shapeWordCount) {
      throw new Error(
        `gpu shape bank shorter than wordCount (length=${gpuDrivenShapeBankWords.length}, wordCount=${shapeWordCount})`,
      );
    }
    if (shapeWordCount > 0) {
      sharedShapeBankWords.set(gpuDrivenShapeBankWords.subarray(0, shapeWordCount), 0);
    }
  }
  publishedSinkWordCount = sinkWordCount;
  publishedShapeWordCount = shapeWordCount;
  gpuDrivenPlanesDirty = false;
}

function readChannel(state: RuntimeState, name: string): number {
  return state.externalChannels.snapshot.getFloat(name);
}

function writeSharedInputWords(
  state: RuntimeState,
  tMs: number,
  sinkTableWords: number,
  shapeBankWords: number,
): void {
  if (!inputWords || !signalWords) {
    throw new Error('shared input plane is not attached');
  }
  const leftButton = readChannel(state, 'mouse.button.left.held') > 0 ? 1 : 0;
  const rightButton = readChannel(state, 'mouse.button.right.held') > 0 ? 1 : 0;
  const middleButton = readChannel(state, 'mouse.button.middle.held') > 0 ? 1 : 0;
  const safeZoom = Math.max(0.1, coerceFinite(viewport.zoom) || 1);

  inputWords[RUNTIME_INPUT_INDEX.width] = viewport.width;
  inputWords[RUNTIME_INPUT_INDEX.height] = viewport.height;
  inputWords[RUNTIME_INPUT_INDEX.zoom] = safeZoom;
  inputWords[RUNTIME_INPUT_INDEX.panX] = viewport.panX;
  inputWords[RUNTIME_INPUT_INDEX.panY] = viewport.panY;
  inputWords[RUNTIME_INPUT_INDEX.timeMs] = tMs;
  inputWords[RUNTIME_INPUT_INDEX.mouseX] = coerceFinite(readChannel(state, 'mouse.x'));
  inputWords[RUNTIME_INPUT_INDEX.mouseY] = coerceFinite(readChannel(state, 'mouse.y'));
  inputWords[RUNTIME_INPUT_INDEX.mouseButtons] = leftButton | (rightButton << 1) | (middleButton << 2);
  inputWords[RUNTIME_INPUT_INDEX.audioLow] = coerceFinite(readChannel(state, 'audio.low'));
  inputWords[RUNTIME_INPUT_INDEX.audioMid] = coerceFinite(readChannel(state, 'audio.mid'));
  inputWords[RUNTIME_INPUT_INDEX.audioHigh] = coerceFinite(readChannel(state, 'audio.high'));
  inputWords[RUNTIME_INPUT_INDEX.gaugeActive] = coerceFinite(readChannel(state, 'gauge.active'));
  inputWords[RUNTIME_INPUT_INDEX.sinkTableWords] = sinkTableWords;
  inputWords[RUNTIME_INPUT_INDEX.shapeBankWords] = shapeBankWords;
  Atomics.add(signalWords, 0, 1);
}

function maybeEmitHeartbeat(nowMs: number): void {
  if (nowMs - lastHeartbeatMs < HEARTBEAT_INTERVAL_MS) return;
  const meanTickMs = tickWindowCount > 0 ? tickWindowTotalMs / tickWindowCount : 0;
  postMessageToMain({
    type: 'HEARTBEAT',
    frameCount,
    meanTickMs,
    lastTickMs,
    drawOpCount: lastDrawOpCount,
    sinkWordCount: lastSinkWordCount,
    sinkTableSample: lastSinkTableSample,
  });
  lastHeartbeatMs = nowMs;
  tickWindowCount = 0;
  tickWindowTotalMs = 0;
}

function tick(): void {
  if (!bootstrapped || paused || disposed) return;
  if (!currentProgram || !currentState) return;
  const tickStart = performance.now();
  flushExternalWrites(currentState);
  currentState.externalChannels.commit();
  const tMs = performance.now();
  publishGpuDrivenPlanesIfDirty();
  writeSharedInputWords(
    currentState,
    tMs,
    publishedSinkWordCount,
    publishedShapeWordCount,
  );
  currentState.cache.frameId = (currentState.cache.frameId + 1) >>> 0;
  frameCount++;
  lastDrawOpCount = currentProgram.drawPrepProgram?.sinks.length ?? 0;
  lastSinkWordCount = publishedSinkWordCount;
  lastTickMs = performance.now() - tickStart;
  tickWindowCount++;
  tickWindowTotalMs += lastTickMs;
  maybeEmitHeartbeat(performance.now());
}

function attachSharedPlanes(message: Extract<RuntimeHotpathWorkerInboundMessage, { type: 'BOOTSTRAP' }>): void {
  signalWords = new Int32Array(message.sharedInput, 0, RUNTIME_INPUT_SIGNAL_WORDS);
  inputWords = new Float32Array(
    message.sharedInput,
    RUNTIME_INPUT_SIGNAL_WORDS * Int32Array.BYTES_PER_ELEMENT,
    RUNTIME_INPUT_FLOAT_WORDS,
  );
  sharedShapeBankWords = new Uint32Array(message.sharedShapeBank);
  sharedSinkTableWords = new Uint32Array(message.sharedSinkTable);
  tickHz = Number.isFinite(message.tickHz) && (message.tickHz ?? 0) > 0
    ? Math.floor(message.tickHz as number)
    : DEFAULT_TICK_HZ;
  bootstrapped = true;
  ensureTickLoop();
  postMessageToMain({ type: 'BOOTSTRAP_SUCCESS' });
}

function handleMessage(message: RuntimeHotpathWorkerInboundMessage): void {
  if (message.type === 'BOOTSTRAP') {
    attachSharedPlanes(message);
    return;
  }
  if (message.type === 'INSTALL_PROGRAM') {
    installProgram(message.program);
    return;
  }
  if (message.type === 'SET_VIEWPORT') {
    viewport = {
      width: Math.max(1, Math.floor(message.width)),
      height: Math.max(1, Math.floor(message.height)),
      zoom: coerceFinite(message.zoom),
      panX: coerceFinite(message.panX),
      panY: coerceFinite(message.panY),
    };
    return;
  }
  if (message.type === 'EXTERNAL_WRITES') {
    for (const write of message.writes) {
      pendingExternalWrites.push(write);
    }
    return;
  }
  if (message.type === 'PAUSE') {
    paused = true;
    return;
  }
  if (message.type === 'RESUME') {
    paused = false;
    ensureTickLoop();
    return;
  }
  disposed = true;
  paused = true;
  stopTickLoop();
  (self as DedicatedWorkerGlobalScope).close();
}

(self as DedicatedWorkerGlobalScope).onmessage = (
  event: MessageEvent<RuntimeHotpathWorkerInboundMessage>,
): void => {
  try {
    handleMessage(event.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postFatal('runtime_worker_message_failed', message);
  }
};
