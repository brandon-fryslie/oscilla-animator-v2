/// <reference lib="webworker" />

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { Step, StepRender } from '../compiler/ir/types';
import { RenderBufferArena } from '../render/RenderBufferArena';
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DrawPrepSinkTableRecordWord,
  buildDrawPrepSinkTableHeader,
  computeDrawPrepSinkTableWordCapacity,
  drawModeToCode,
  createInitialState,
  createRuntimeStateFromSession,
  createSessionState,
  executeFrame,
  migrateState,
  packDrawPrepSinkTableV1,
  prepareStateWriteBank,
  reconcilePhaseOffsets,
  writeDrawPrepSinkRecord,
  writeDrawPrepSinkTableHeader,
  type RuntimeState,
  type SessionState,
} from '../runtime';
import { resolveArenaAddress } from '../runtime/ArenaValueStore';
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

const DEFAULT_TICK_HZ = 60;
const HEARTBEAT_INTERVAL_MS = 500;
const MAX_UINT32 = 0xFFFF_FFFF;
const DEFAULT_ARENA_ELEMENTS = 50_000;

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
let arena = createArena(DEFAULT_ARENA_ELEMENTS);
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

function createArena(maxElements: number): RenderBufferArena {
  const next = new RenderBufferArena(maxElements);
  next.init();
  return next;
}

function computeArenaCapacity(arenaTotalFloats: number): number {
  const required = Number.isFinite(arenaTotalFloats) ? Math.ceil(arenaTotalFloats) : 0;
  // [LAW:one-source-of-truth] Arena capacity derives from compiled program
  // metadata; no hardcoded runtime hotpath capacity is authoritative.
  return Math.max(DEFAULT_ARENA_ELEMENTS, Math.ceil(required * 1.25));
}

interface PackedArenaAddress {
  readonly baseOffset: number;
  readonly laneStride: number;
  readonly componentStride: number;
}

const SCALE_MODE_SLOT = 2;
const OPTIONAL_MODE_IDENTITY = 0;
const OPTIONAL_MODE_SLOT = 1;
const SHAPE_SOURCE_ONE_HANDLE = 0;
const SHAPE_SOURCE_SLOT = 1;

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

function requireRenderStep(program: CompiledProgramIR, renderStepIndex: number): StepRender {
  const step = (program.schedule.steps as readonly Step[])[renderStepIndex];
  if (!step || step.kind !== 'render') {
    throw new Error(
      `runtime-hotpath: draw-prep sink references invalid render step ${String(renderStepIndex)}`,
    );
  }
  return step;
}

function resolveSlotArenaAddress(
  program: CompiledProgramIR,
  slot: number,
  context: string,
): PackedArenaAddress {
  const descriptor = program.runtimeAddressTable?.slotToArena.get(slot as any);
  if (!descriptor) {
    throw new Error(`runtime-hotpath: missing slotToArena descriptor for ${context}`);
  }
  const address = resolveArenaAddress(descriptor);
  return {
    baseOffset: assertFiniteUint32(address.baseOffset, `${context}.baseOffset`),
    laneStride: assertFiniteUint32(address.laneStride, `${context}.laneStride`),
    componentStride: assertFiniteUint32(address.componentStride, `${context}.componentStride`),
  };
}

function warmRecordWord(
  warmPackedWords: Uint32Array | null,
  sinkIndex: number,
  wordOffset: number,
  fallback: number,
): number {
  if (!warmPackedWords) return fallback >>> 0;
  const base = DRAW_PREP_SINK_TABLE_HEADER_WORDS + sinkIndex * DRAW_PREP_SINK_TABLE_RECORD_WORDS;
  if (base + wordOffset >= warmPackedWords.length) return fallback >>> 0;
  return (warmPackedWords[base + wordOffset] ?? fallback) >>> 0;
}

function resolveSinkInstanceCount(
  program: CompiledProgramIR,
  state: RuntimeState,
  sinkIndex: number,
  warmPackedWords: Uint32Array | null,
): number {
  const drawPrepProgram = program.drawPrepProgram;
  if (!drawPrepProgram) return 0;
  const sink = drawPrepProgram.sinks[sinkIndex];
  if (!sink) return 0;
  if (sink.instanceCountMode === 'static') {
    return assertFiniteUint32(
      sink.staticInstanceCount ?? Number.NaN,
      `staticInstanceCount sinkIndex=${sink.sinkIndex}`,
    );
  }
  const dynamicCount = state.cache.instanceLaneCounts?.get(String(sink.instanceId));
  if (dynamicCount === undefined) {
    return assertFiniteUint32(
      warmRecordWord(
        warmPackedWords,
        sinkIndex,
        DrawPrepSinkTableRecordWord.InstanceCount,
        0,
      ),
      `dynamicInstanceCountFallback sinkIndex=${sink.sinkIndex}`,
    );
  }
  return assertFiniteUint32(dynamicCount, `dynamicInstanceCount sinkIndex=${sink.sinkIndex}`);
}

function warmShapeHandleForSink(
  warmPackedWords: Uint32Array | null,
  sinkIndex: number,
): number {
  if (!warmPackedWords) return 0;
  const base = DRAW_PREP_SINK_TABLE_HEADER_WORDS + sinkIndex * DRAW_PREP_SINK_TABLE_RECORD_WORDS;
  if (base + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset >= warmPackedWords.length) {
    return 0;
  }
  return warmPackedWords[base + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset] >>> 0;
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
        shapeHandleWordOffset: words[base + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset] ?? 0,
        shapeSourceCode: words[base + DrawPrepSinkTableRecordWord.ShapeSourceCode] ?? 0,
        instanceCount: words[base + DrawPrepSinkTableRecordWord.InstanceCount] ?? 0,
        firstInstance: words[base + DrawPrepSinkTableRecordWord.FirstInstance] ?? 0,
        positionBaseOffset: words[base + DrawPrepSinkTableRecordWord.PositionBaseOffset] ?? 0,
        positionLaneStride: words[base + DrawPrepSinkTableRecordWord.PositionLaneStride] ?? 0,
        positionComponentStride: words[base + DrawPrepSinkTableRecordWord.PositionComponentStride] ?? 0,
        colorBaseOffset: words[base + DrawPrepSinkTableRecordWord.ColorBaseOffset] ?? 0,
        colorLaneStride: words[base + DrawPrepSinkTableRecordWord.ColorLaneStride] ?? 0,
        colorComponentStride: words[base + DrawPrepSinkTableRecordWord.ColorComponentStride] ?? 0,
        scaleModeCode: words[base + DrawPrepSinkTableRecordWord.ScaleModeCode] ?? 0,
        scaleValueOrBaseOffset: words[base + DrawPrepSinkTableRecordWord.ScaleValueOrBaseOffset] ?? 0,
        scaleLaneStride: words[base + DrawPrepSinkTableRecordWord.ScaleLaneStride] ?? 0,
        scaleComponentStride: words[base + DrawPrepSinkTableRecordWord.ScaleComponentStride] ?? 0,
        shapeSlotBaseOffset: words[base + DrawPrepSinkTableRecordWord.ShapeSlotBaseOffset] ?? 0,
        shapeSlotLaneStride: words[base + DrawPrepSinkTableRecordWord.ShapeSlotLaneStride] ?? 0,
        shapeSlotComponentStride: words[base + DrawPrepSinkTableRecordWord.ShapeSlotComponentStride] ?? 0,
      }
      : null,
  };
}

function buildGpuDrivenSinkTableWords(
  program: CompiledProgramIR,
  state: RuntimeState,
  warmPackedWords: Uint32Array | null,
): { words: Uint32Array; wordCount: number } | null {
  const drawPrepProgram = program.drawPrepProgram;
  if (!drawPrepProgram) return null;
  const header = buildDrawPrepSinkTableHeader(drawPrepProgram);
  const wordCount = assertFiniteUint32(
    computeDrawPrepSinkTableWordCapacity(header.totalRecordCount),
    'gpuDrivenSinkTable.wordCount',
  );
  const words = new Uint32Array(wordCount);
  writeDrawPrepSinkTableHeader(words, header);
  let firstInstance = 0;
  for (let sinkIndex = 0; sinkIndex < drawPrepProgram.sinks.length; sinkIndex++) {
    const sink = drawPrepProgram.sinks[sinkIndex];
    const renderStep = requireRenderStep(program, sink.renderStepIndex);
    const instanceCount = resolveSinkInstanceCount(program, state, sinkIndex, warmPackedWords);

    const positionAddress = resolveSlotArenaAddress(
      program,
      renderStep.controlPointsSlot as number,
      `controlPointsSlot sinkIndex=${sink.sinkIndex}`,
    );
    const colorAddress = resolveSlotArenaAddress(
      program,
      renderStep.colorSlot as number,
      `colorSlot sinkIndex=${sink.sinkIndex}`,
    );
    const shapeAddress = renderStep.shape.k === 'slot'
      ? resolveSlotArenaAddress(
        program,
        renderStep.shape.slot as number,
        `shapeSlot sinkIndex=${sink.sinkIndex}`,
      )
      : null;

    const scaleSpec = renderStep.scale;
    if (!scaleSpec || scaleSpec.k !== 'slot') {
      throw new Error(
        `runtime-hotpath: render scale must be slot-backed (sinkIndex=${sink.sinkIndex})`,
      );
    }
    const scaleAddress = resolveSlotArenaAddress(
      program,
      scaleSpec.slot as number,
      `scaleSlot sinkIndex=${sink.sinkIndex}`,
    );
    const scaleModeCode = SCALE_MODE_SLOT;
    const scaleValueOrBaseOffset = scaleAddress.baseOffset;
    const scaleLaneStride = scaleAddress.laneStride;
    const scaleComponentStride = scaleAddress.componentStride;

    const rotationAddress = renderStep.rotationSlot !== undefined
      ? resolveSlotArenaAddress(
        program,
        renderStep.rotationSlot as number,
        `rotationSlot sinkIndex=${sink.sinkIndex}`,
      )
      : null;
    const scale2Address = renderStep.scale2Slot !== undefined
      ? resolveSlotArenaAddress(
        program,
        renderStep.scale2Slot as number,
        `scale2Slot sinkIndex=${sink.sinkIndex}`,
      )
      : null;

    // [LAW:single-enforcer] GPU-driven sink table is authored once at install
    // from compiler metadata; per-frame ticks only publish shared values.
    writeDrawPrepSinkRecord(words, sinkIndex, {
      sinkIndex: sink.sinkIndex,
      drawMode: drawModeToCode(sink.drawMode),
      shapeHandleWordOffset: warmShapeHandleForSink(warmPackedWords, sinkIndex),
      indirectRecordIndex: sink.indirectRecordIndex,
      instanceCount,
      firstInstance: assertFiniteUint32(firstInstance, `firstInstance sinkIndex=${sink.sinkIndex}`),
      renderStepIndex: sink.renderStepIndex,
      shapeSourceCode: renderStep.shape.k === 'slot' ? SHAPE_SOURCE_SLOT : SHAPE_SOURCE_ONE_HANDLE,
      positionBaseOffset: positionAddress.baseOffset,
      positionLaneStride: positionAddress.laneStride,
      positionComponentStride: positionAddress.componentStride,
      colorBaseOffset: colorAddress.baseOffset,
      colorLaneStride: colorAddress.laneStride,
      colorComponentStride: colorAddress.componentStride,
      scaleModeCode,
      scaleValueOrBaseOffset,
      scaleLaneStride,
      scaleComponentStride,
      rotationModeCode: rotationAddress ? OPTIONAL_MODE_SLOT : OPTIONAL_MODE_IDENTITY,
      rotationBaseOffset: rotationAddress?.baseOffset ?? 0,
      rotationLaneStride: rotationAddress?.laneStride ?? 0,
      rotationComponentStride: rotationAddress?.componentStride ?? 0,
      scale2ModeCode: scale2Address ? OPTIONAL_MODE_SLOT : OPTIONAL_MODE_IDENTITY,
      scale2BaseOffset: scale2Address?.baseOffset ?? 0,
      scale2LaneStride: scale2Address?.laneStride ?? 0,
      scale2ComponentStride: scale2Address?.componentStride ?? 0,
      shapeSlotBaseOffset: shapeAddress?.baseOffset ?? 0,
      shapeSlotLaneStride: shapeAddress?.laneStride ?? 0,
      shapeSlotComponentStride: shapeAddress?.componentStride ?? 0,
    });
    firstInstance = assertFiniteUint32(
      firstInstance + instanceCount,
      `firstInstancePrefix sinkIndex=${sink.sinkIndex}`,
    );
  }
  return { words, wordCount };
}

function installProgram(program: SerializableCompiledProgramIR): void {
  const revived = reviveProgram(program);
  const targetArenaCapacity = computeArenaCapacity(revived.arenaTotalFloats);
  if (arena.maxElements < targetArenaCapacity) {
    // [LAW:no-silent-fallbacks] If compiled arena demand exceeds the current
    // buffer arena, resize eagerly at install time instead of failing warmup.
    arena = createArena(targetArenaCapacity);
  }
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

  let warmPackedWords: Uint32Array | null = null;
  let warmupFailed = false;
  try {
    // [LAW:single-enforcer] One warmup executeFrame seeds runtime-owned shape
    // bank and dynamic counts at compile boundary; tick path stays GPU-owned.
    arena.reset();
    executeFrame(revived, nextState, arena, performance.now());
    const warmPacked = packDrawPrepSinkTableV1(revived, nextState);
    warmPackedWords = warmPacked?.words ?? null;
  } catch (error) {
    warmupFailed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[runtime-hotpath] warmup executeFrame failed: ${message}`);
  }
  const warmShapeBankWordCount = assertFiniteUint32(
    nextState.shapeBank.volatilePtr,
    'gpuDrivenShapeBank.wordCount',
  );
  const warmShapeBankWords = new Uint32Array(warmShapeBankWordCount);
  if (warmShapeBankWordCount > 0) {
    warmShapeBankWords.set(
      nextState.shapeBank.data.subarray(0, warmShapeBankWordCount),
      0,
    );
  }

  gpuDrivenExecutionEnabled = false;
  gpuDrivenSinkTableWords = null;
  gpuDrivenSinkTableWordCount = 0;
  lastSinkTableSample = null;
  gpuDrivenShapeBankWords = warmShapeBankWords;
  gpuDrivenShapeBankWordCount = warmShapeBankWordCount;
  publishedSinkWordCount = 0;
  publishedShapeWordCount = 0;
  gpuDrivenPlanesDirty = true;
  // TODO(steel-thread): Per-frame CPU payload execution path was deleted in
  // favor of one GPU-static sink/shape publication path. If a future compile
  // artifact cannot satisfy this contract, fail installation instead of
  // reintroducing runtime mode branching.
  // [LAW:no-mode-explosion] Canonical runtime execution keeps one mode.
  try {
    const gpuDriven = buildGpuDrivenSinkTableWords(revived, nextState, warmPackedWords);
    if (gpuDriven) {
      gpuDrivenExecutionEnabled = true;
      gpuDrivenSinkTableWords = gpuDriven.words;
      gpuDrivenSinkTableWordCount = gpuDriven.wordCount;
      lastSinkTableSample = buildSinkTableSample(gpuDriven.words, gpuDriven.wordCount);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[runtime-hotpath] GPU sink-table build failed: ${message}`);
  }
  if (warmupFailed && (revived.drawPrepProgram?.sinks.length ?? 0) > 0) {
    // [LAW:no-silent-fallbacks] GPU hotpath programs cannot silently continue
    // after warmup failure because that would re-enable per-frame CPU paths.
    throw new Error('[runtime-hotpath] warmup executeFrame failed for GPU hotpath program');
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
