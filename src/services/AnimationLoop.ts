/**
 * Animation Loop Service
 *
 * Manages the requestAnimationFrame loop, frame execution, rendering,
 * and performance metrics tracking.
 */

import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DrawPrepSinkTableRecordWord,
  ShapeBankHeaderWord,
  assertSchedulePhaseBoundaryStateReads,
  executeFrame,
  packDrawPrepSinkTableV1,
} from '../runtime';
import { RenderBufferArena, type WebGPURenderer } from '../render';
import {
  recordFrameTime,
  recordFrameDelta,
  shouldEmitSnapshot,
  emitHealthSnapshot,
  computeFrameTimingStats,
  resetFrameTimingStats,
} from '../runtime/HealthMonitor';
import { JANK_THRESHOLD_MS } from '../stores/DiagnosticsStore';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RootStore } from '../stores';
import type { RenderFrameIR } from '../render/types';
import { isRuntimeConsoleEnabled } from '../testing/test-params';
import { markRuntimeFrameAdvanced } from '../testing/runtime-probe';
import type { RuntimeHotpathWorkerClient } from './RuntimeHotpathWorkerClient';

export interface AnimationLoopState {
  frameCount: number;
  lastFpsUpdate: number;
  fps: number;
  execTime: number;
  renderTime: number;
  minFrameTime: number;
  maxFrameTime: number;
  frameTimeSum: number;
  lastContinuityStoreUpdate: number;
}

export interface AnimationLoopDeps {
  getCurrentProgram: () => any | null;
  getCurrentState: () => RuntimeState | null;
  getCanvas: () => HTMLCanvasElement | null;
  getRenderer: () => WebGPURenderer | null;
  getRuntimeHotpath?: () => RuntimeHotpathWorkerClient | null;
  getArena: () => RenderBufferArena | null;
  store: RootStore;
  onStatsUpdate?: (statsText: string) => void;
}

export interface AnimationLoopController {
  stop: () => void;
  onCompileSuccess: () => boolean;
}

function assertWebGPULoopContract(deps: AnimationLoopDeps): void {
  const canvas = deps.getCanvas();
  const renderer = deps.getRenderer();
  const arena = deps.getArena();

  if (!canvas || !renderer || !arena) {
    // [LAW:no-silent-fallbacks] Runtime loop must hard-fail when required
    // WebGPU rendering dependencies are missing.
    throw new Error('AnimationLoop: WebGPU runtime contract requires canvas, renderer, and arena');
  }
}

const CONTINUITY_STORE_UPDATE_INTERVAL = 200; // 5Hz
const EMPTY_RENDER_FRAME: RenderFrameIR = { version: 2, ops: [] };
const RUNTIME_CONSOLE_ENABLED = isRuntimeConsoleEnabled();
const shapeWordScratch = new Uint32Array(1);
const shapeFloatScratch = new Float32Array(shapeWordScratch.buffer);

function uint32BitsToFloat32(word: number): number {
  shapeWordScratch[0] = word >>> 0;
  return shapeFloatScratch[0];
}

function readChannel(snapshot: { getFloat: (name: string) => number } | undefined, name: string): number {
  return snapshot?.getFloat(name) ?? 0;
}

function resolveRendererInputChannels(currentState: RuntimeState): {
  readonly inputMouseX: number;
  readonly inputMouseY: number;
  readonly inputMouseButtons: number;
  readonly inputAudioLow: number;
  readonly inputAudioMid: number;
  readonly inputAudioHigh: number;
  readonly inputGaugeActive: number;
} {
  const snapshot = currentState.externalChannels?.snapshot;
  const leftButton = readChannel(snapshot, 'mouse.button.left.held') > 0 ? 1 : 0;
  const rightButton = readChannel(snapshot, 'mouse.button.right.held') > 0 ? 1 : 0;
  const middleButton = readChannel(snapshot, 'mouse.button.middle.held') > 0 ? 1 : 0;

  // [LAW:one-source-of-truth] External channel snapshot is the canonical
  // runtime input source; renderer payload values are derived from it only.
  return {
    inputMouseX: readChannel(snapshot, 'mouse.x'),
    inputMouseY: readChannel(snapshot, 'mouse.y'),
    inputMouseButtons: leftButton | (rightButton << 1) | (middleButton << 2),
    inputAudioLow: readChannel(snapshot, 'audio.low'),
    inputAudioMid: readChannel(snapshot, 'audio.mid'),
    inputAudioHigh: readChannel(snapshot, 'audio.high'),
    inputGaugeActive: readChannel(snapshot, 'gauge.active'),
  };
}

function assertProgramPhaseBoundary(deps: AnimationLoopDeps): void {
  const program = deps.getCurrentProgram();
  if (!program) return;
  // [LAW:dataflow-not-control-flow] Invariant validation runs at compile/start
  // boundaries so frame execution order stays fixed with zero assertion work.
  // [LAW:no-silent-fallbacks] Phase-boundary violations are fail-fast invariants,
  // not optional runtime behavior.
  assertSchedulePhaseBoundaryStateReads(program);
}

/**
 * Create initial animation loop state
 */
export function createAnimationLoopState(): AnimationLoopState {
  return {
    frameCount: 0,
    lastFpsUpdate: performance.now(),
    fps: 0,
    execTime: 0,
    renderTime: 0,
    minFrameTime: Infinity,
    maxFrameTime: 0,
    frameTimeSum: 0,
    lastContinuityStoreUpdate: 0,
  };
}

function resetAnimationLoopState(state: AnimationLoopState): void {
  const next = createAnimationLoopState();
  state.frameCount = next.frameCount;
  state.lastFpsUpdate = next.lastFpsUpdate;
  state.fps = next.fps;
  state.execTime = next.execTime;
  state.renderTime = next.renderTime;
  state.minFrameTime = next.minFrameTime;
  state.maxFrameTime = next.maxFrameTime;
  state.frameTimeSum = next.frameTimeSum;
  state.lastContinuityStoreUpdate = next.lastContinuityStoreUpdate;
}

/**
 * Acquire a render frame for this tick.
 *
 * [LAW:dataflow-not-control-flow] The frame source varies (normal execution vs debug stepping);
 * the pipeline that consumes the frame does not. This function encapsulates the only
 * variability: how the frame is produced.
 *
 * @returns The frame to render (null if no frame is available) and execution time.
 */
function acquireFrame(
  tMs: number,
  deps: AnimationLoopDeps,
  currentProgram: any,
  currentState: RuntimeState,
  arena: RenderBufferArena,
): { frame: RenderFrameIR | null; execTimeMs: number } {
  const { store } = deps;
  const stepDebug = store.stepDebug;

  // Debug mode: frame is produced by user-driven stepping, not the schedule executor
  if (stepDebug?.active) {
    // If idle or completed with no active frame, start a new frame
    if (stepDebug.mode === 'idle' || stepDebug.mode === 'completed') {
      arena.reset();
      stepDebug.startFrame(currentProgram, currentState, arena, tMs);
    }
    return { frame: stepDebug.lastFrameResult, execTimeMs: 0 };
  }

  // Normal mode: execute the full schedule
  arena.reset();
  const execStart = performance.now();
  const cardinalityAssertionsEnabled =
    store.debug?.enabled === true && store.debug?.traceCardinalitySolver === true;
  const frame = cardinalityAssertionsEnabled
    ? executeFrame(currentProgram, currentState, arena, tMs, { assertCardinalitySlotWrites: true })
    : executeFrame(currentProgram, currentState, arena, tMs);
  const execTimeMs = performance.now() - execStart;
  return { frame, execTimeMs };
}

/**
 * Execute a single animation frame.
 *
 * [LAW:dataflow-not-control-flow] The pipeline (acquire frame, render pass, metrics, continuity, FPS)
 * always runs in the same order. Only the frame source varies (via acquireFrame).
 * Null frame = empty collection (no ops to draw), not control-flow branching.
 */
export function executeAnimationFrame(
  tMs: number,
  deps: AnimationLoopDeps,
  state: AnimationLoopState
): void {
  const {
    getCurrentProgram,
    getCurrentState,
    getCanvas,
    getRenderer,
    getRuntimeHotpath,
    getArena,
    store,
    onStatsUpdate,
  } = deps;

  const currentProgram = getCurrentProgram();
  const canvas = getCanvas();
  const renderer = getRenderer();

  if (!canvas || !renderer) {
    throw new Error('AnimationLoop: WebGPU runtime contract requires canvas, renderer, and arena');
  }

  if (!currentProgram) {
    return;
  }

  const runtimeHotpath = getRuntimeHotpath?.() ?? null;
  if (runtimeHotpath) {
    const { zoom, pan } = store.viewport;
    const renderWidth = Math.max(1, Math.floor(store.viewport.canvasWidth || canvas.width));
    const renderHeight = Math.max(1, Math.floor(store.viewport.canvasHeight || canvas.height));
    renderer.resizeCanvas(renderWidth, renderHeight);
    runtimeHotpath.setViewportFrame({
      width: renderWidth,
      height: renderHeight,
      zoom,
      panX: pan.x,
      panY: pan.y,
    });

    state.frameCount++;
    const now = performance.now();
    if (now - state.lastFpsUpdate > 500) {
      state.fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsUpdate));
      const workerStats = runtimeHotpath.getLatestStats();
      const schedulerState = renderer.getLifecycleState();
      const telemetry = renderer.getLatestRuntimeTelemetry();
      const statsText = `FPS: ${state.fps} | DrawOps: ${workerStats?.drawOpCount ?? 0} | `
        + `Tick: ${(workerStats?.lastTickMs ?? 0).toFixed(1)}ms`;
      onStatsUpdate?.(statsText);
      if (RUNTIME_CONSOLE_ENABLED) {
        console.info(
          `[runtimeConsole] ${statsText}`
          + ` | sinkWords=${workerStats?.sinkWordCount ?? 0}`
          + ` | scheduler=${schedulerState}`
          + ` | workerFrames=${workerStats?.frameCount ?? telemetry?.frameCount ?? 0}`,
        );
      }
      state.frameCount = 0;
      state.lastFpsUpdate = now;
    }
    return;
  }

  const currentState = getCurrentState();
  const arena = getArena();
  if (!arena) {
    throw new Error('AnimationLoop: WebGPU runtime contract requires canvas, renderer, and arena');
  }
  if (!currentState) {
    return;
  }

  // Capture delta BEFORE recordFrameDelta updates prevRafTimestamp
  const prevRaf = currentState.health.prevRafTimestamp;
  const rafDelta = prevRaf !== null ? tMs - prevRaf : 0;

  // Record frame delta FIRST (using rAF timestamp for precision)
  recordFrameDelta(currentState, tMs);

  // Jank detection — state.execTime/renderTime still hold PREVIOUS frame's values
  if (rafDelta > JANK_THRESHOLD_MS) {
    const prevExec = state.execTime;
    const prevRender = state.renderTime;
    store.diagnostics.recordJank({
      wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
      deltaMs: rafDelta,
      prevExecMs: prevExec,
      prevRenderMs: prevRender,
      browserGapMs: Math.max(0, rafDelta - prevExec - prevRender),
    });
  }

  const frameStart = performance.now();

  // Acquire frame — source varies (normal execution vs debug stepping), pipeline does not
  const { frame, execTimeMs } = acquireFrame(tMs, deps, currentProgram, currentState, arena);
  state.execTime = execTimeMs;

  // Render with zoom/pan transform from store
  const renderStart = performance.now();
  const { zoom, pan } = store.viewport;
  const frameToRender = frame ?? EMPTY_RENDER_FRAME;
  const shapeBank = currentState.shapeBank;
  if (!shapeBank) {
    throw new Error('AnimationLoop: RuntimeState.shapeBank is required for WebGPU rendering');
  }
  const renderWidth = Math.max(1, Math.floor(store.viewport.canvasWidth || canvas.width));
  const renderHeight = Math.max(1, Math.floor(store.viewport.canvasHeight || canvas.height));
  // [LAW:single-enforcer] Runtime packs per-frame sink-table records once at
  // this frame boundary; worker executes the packed payload without re-deriving.
  const packedSinkTable = packDrawPrepSinkTableV1(currentProgram, currentState);
  const inputChannels = resolveRendererInputChannels(currentState);
  renderer.render({
    shapeBank,
    width: renderWidth,
    height: renderHeight,
    zoom,
    panX: pan.x,
    panY: pan.y,
    timeMs: tMs,
    ...inputChannels,
    drawPrepSinkTableV1: packedSinkTable?.words,
    drawPrepSinkTableWordCount: packedSinkTable?.wordCount ?? 0,
  });
  state.renderTime = performance.now() - renderStart;
  const probeFrameId = currentState.cache?.frameId ?? -1;
  markRuntimeFrameAdvanced(probeFrameId, tMs);

  // [LAW:dataflow-not-control-flow] Canonical render loop avoids CPU-side
  // coordinate scans in the hot path; content-bounds updates are data-empty.
  store.viewport.setContentBounds(null);

  // NOTE: No buffer release needed - arena is reset at frame start (O(1))

  // Calculate frame time
  const frameTime = performance.now() - frameStart;

  // Record health metrics (zeros are valid data in debug mode)
  recordFrameTime(currentState, frameTime);

  // Emit health snapshot if throttle interval elapsed
  if (shouldEmitSnapshot(currentState)) {
    // Compute frame timing stats before emitting
    const timingStats = computeFrameTimingStats(currentState);

    // Update diagnostics store with timing stats
    store.diagnostics.updateFrameTiming(timingStats);

    // Update diagnostics store with memory stats (arena is zero-alloc after init)
    store.diagnostics.updateMemoryStats({
      poolAllocs: 0,
      poolReleases: 0,
      pooledBytes: arena.getTotalBytes(),
      poolKeyCount: 6, // f32, vec2f32, vec3f32, rgba8, u32, u8
    });

    emitHealthSnapshot(
      currentState,
      store.events,
      'patch-0',
      store.getPatchRevision(),
      tMs
    );

    // Reset timing stats for next window
    resetFrameTimingStats(currentState);
  }

  // Update continuity store (batched at 5Hz)
  if (tMs - state.lastContinuityStoreUpdate >= CONTINUITY_STORE_UPDATE_INTERVAL) {
    store.continuity.updateFromRuntime(currentState.continuity, tMs);
    state.lastContinuityStoreUpdate = tMs;
  }

  // Track min/max
  state.minFrameTime = Math.min(state.minFrameTime, frameTime);
  state.maxFrameTime = Math.max(state.maxFrameTime, frameTime);
  state.frameTimeSum += frameTime;

  // Update FPS and performance metrics
  state.frameCount++;
  const now = performance.now();
  if (now - state.lastFpsUpdate > 500) {
    state.fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsUpdate));

    // Calculate total elements being rendered
    const totalElements = frameToRender.ops.reduce((sum: number, op) => sum + op.instances.count, 0);
    const statsText = `FPS: ${state.fps} | Elements: ${totalElements} | ${state.execTime.toFixed(1)}/${state.renderTime.toFixed(1)}ms`;

    // Update stats via callback
    if (onStatsUpdate) {
      onStatsUpdate(statsText);
    }
    if (RUNTIME_CONSOLE_ENABLED) {
      const schedulerState = renderer.getLifecycleState();
      const telemetry = renderer.getLatestRuntimeTelemetry();
      const sinkHeader = packedSinkTable?.header;
      const firstOp = frameToRender.ops[0];
      const firstPosX = firstOp?.instances.position[0] ?? NaN;
      const firstPosY = firstOp?.instances.position[1] ?? NaN;
      let firstSize = NaN;
      if (firstOp) {
        const sizeValue = firstOp.instances.size;
        firstSize = typeof sizeValue === 'number' ? sizeValue : (sizeValue[0] ?? NaN);
      }
      let firstAlpha = NaN;
      if (firstOp) {
        if (firstOp.style.fillColor instanceof Uint8ClampedArray) {
          firstAlpha = (firstOp.style.fillColor[3] ?? NaN) / 255;
        } else {
          const alphaValue = firstOp.style.globalAlpha;
          firstAlpha = typeof alphaValue === 'number' ? alphaValue : (alphaValue?.[0] ?? NaN);
        }
      }
      const firstShapeHandleWordOffset = packedSinkTable
        ? packedSinkTable.words[
          DRAW_PREP_SINK_TABLE_HEADER_WORDS + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset
        ] ?? NaN
        : NaN;
      const firstRecordPositionBaseOffset = packedSinkTable
        ? packedSinkTable.words[
          DRAW_PREP_SINK_TABLE_HEADER_WORDS + DrawPrepSinkTableRecordWord.PositionBaseOffset
        ] ?? NaN
        : NaN;
      const firstRecordPositionLaneStride = packedSinkTable
        ? packedSinkTable.words[
          DRAW_PREP_SINK_TABLE_HEADER_WORDS + DrawPrepSinkTableRecordWord.PositionLaneStride
        ] ?? NaN
        : NaN;
      const firstRecordPositionComponentStride = packedSinkTable
        ? packedSinkTable.words[
          DRAW_PREP_SINK_TABLE_HEADER_WORDS + DrawPrepSinkTableRecordWord.PositionComponentStride
        ] ?? NaN
        : NaN;
      let arenaPosLane0X = NaN;
      let arenaPosLane0Y = NaN;
      let arenaPosLane1X = NaN;
      let arenaPosLane1Y = NaN;
      if (
        Number.isFinite(firstRecordPositionBaseOffset)
        && Number.isFinite(firstRecordPositionLaneStride)
        && Number.isFinite(firstRecordPositionComponentStride)
      ) {
        const base = firstRecordPositionBaseOffset as number;
        const laneStride = firstRecordPositionLaneStride as number;
        const componentStride = firstRecordPositionComponentStride as number;
        const lane0XIndex = base;
        const lane0YIndex = base + componentStride;
        const lane1XIndex = base + laneStride;
        const lane1YIndex = base + laneStride + componentStride;
        arenaPosLane0X = currentState.arena[lane0XIndex] ?? NaN;
        arenaPosLane0Y = currentState.arena[lane0YIndex] ?? NaN;
        arenaPosLane1X = currentState.arena[lane1XIndex] ?? NaN;
        arenaPosLane1Y = currentState.arena[lane1YIndex] ?? NaN;
      }
      const firstRecordInstanceCount = packedSinkTable
        ? packedSinkTable.words[
          DRAW_PREP_SINK_TABLE_HEADER_WORDS + DrawPrepSinkTableRecordWord.InstanceCount
        ] ?? NaN
        : NaN;
      const firstRecordFirstInstance = packedSinkTable
        ? packedSinkTable.words[
          DRAW_PREP_SINK_TABLE_HEADER_WORDS + DrawPrepSinkTableRecordWord.FirstInstance
        ] ?? NaN
        : NaN;
      const firstRecordIndirectIndex = packedSinkTable
        ? packedSinkTable.words[
          DRAW_PREP_SINK_TABLE_HEADER_WORDS + DrawPrepSinkTableRecordWord.IndirectRecordIndex
        ] ?? NaN
        : NaN;
      const firstShapeIndexCount = Number.isFinite(firstShapeHandleWordOffset)
        ? shapeBank.data[(firstShapeHandleWordOffset as number) + ShapeBankHeaderWord.IndexCount] ?? NaN
        : NaN;
      const firstShapeVertexCount = Number.isFinite(firstShapeHandleWordOffset)
        ? shapeBank.data[(firstShapeHandleWordOffset as number) + ShapeBankHeaderWord.VertexCount] ?? NaN
        : NaN;
      let shapePointMinX = NaN;
      let shapePointMaxX = NaN;
      let shapePointMinY = NaN;
      let shapePointMaxY = NaN;
      if (Number.isFinite(firstShapeHandleWordOffset)) {
        const shapeBase = firstShapeHandleWordOffset as number;
        const paramBlockOffset =
          shapeBank.data[shapeBase + ShapeBankHeaderWord.ParamBlockOffset] ?? 0;
        const paramBlockWords =
          shapeBank.data[shapeBase + ShapeBankHeaderWord.ParamBlockWords] ?? 0;
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (let pointWord = 0; pointWord + 1 < paramBlockWords; pointWord += 2) {
          const xWord = shapeBank.data[paramBlockOffset + pointWord];
          const yWord = shapeBank.data[paramBlockOffset + pointWord + 1];
          if (xWord === undefined || yWord === undefined) {
            break;
          }
          const x = uint32BitsToFloat32(xWord);
          const y = uint32BitsToFloat32(yWord);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        shapePointMinX = Number.isFinite(minX) ? minX : NaN;
        shapePointMaxX = Number.isFinite(maxX) ? maxX : NaN;
        shapePointMinY = Number.isFinite(minY) ? minY : NaN;
        shapePointMaxY = Number.isFinite(maxY) ? maxY : NaN;
      }
      // [LAW:single-enforcer] Runtime loop emits one canonical periodic
      // console summary when URL opt-in is enabled.
      console.info(
        `[runtimeConsole] ${statsText}`
        + ` | drawOps=${frameToRender.ops.length}`
        + ` | sinkRecords=${sinkHeader?.totalRecordCount ?? 0}`
        + ` (indexed=${sinkHeader?.indexedRecordCount ?? 0}, nonIndexed=${sinkHeader?.nonIndexedRecordCount ?? 0})`
        + ` | sinkRegions=(iBase=${sinkHeader?.indexedRegionBaseWords ?? 0},nBase=${sinkHeader?.nonIndexedRegionBaseWords ?? 0},iStride=${sinkHeader?.indexedStrideWords ?? 0},nStride=${sinkHeader?.nonIndexedStrideWords ?? 0})`
        + ` | viewport=${renderWidth}x${renderHeight}`
        + ` | domCanvas=${canvas.width}x${canvas.height}`
        + ` | shapeBankWords=${shapeBank.volatilePtr}`
        + ` | sinkWords=${packedSinkTable?.wordCount ?? 0}`
        + ` | frameId=${currentState.cache?.frameId ?? -1}`
        + ` | scheduler=${schedulerState}`
        + ` | workerFrames=${telemetry?.frameCount ?? 0}`
        + ` | cpuPos=(${Number.isFinite(firstPosX) ? firstPosX.toFixed(3) : 'na'},${Number.isFinite(firstPosY) ? firstPosY.toFixed(3) : 'na'})`
        + ` | cpuSize=${Number.isFinite(firstSize) ? firstSize.toFixed(3) : 'na'}`
        + ` | cpuAlpha=${Number.isFinite(firstAlpha) ? firstAlpha.toFixed(3) : 'na'}`
        + ` | shapeHandle=${Number.isFinite(firstShapeHandleWordOffset) ? String(firstShapeHandleWordOffset) : 'na'}`
        + ` | sinkRecord(instanceCount=${Number.isFinite(firstRecordInstanceCount) ? String(firstRecordInstanceCount) : 'na'},firstInstance=${Number.isFinite(firstRecordFirstInstance) ? String(firstRecordFirstInstance) : 'na'},indirectIndex=${Number.isFinite(firstRecordIndirectIndex) ? String(firstRecordIndirectIndex) : 'na'})`
        + ` | sinkPos(base=${Number.isFinite(firstRecordPositionBaseOffset) ? String(firstRecordPositionBaseOffset) : 'na'},laneStride=${Number.isFinite(firstRecordPositionLaneStride) ? String(firstRecordPositionLaneStride) : 'na'},componentStride=${Number.isFinite(firstRecordPositionComponentStride) ? String(firstRecordPositionComponentStride) : 'na'})`
        + ` | arenaPos(l0=(${Number.isFinite(arenaPosLane0X) ? arenaPosLane0X.toFixed(3) : 'na'},${Number.isFinite(arenaPosLane0Y) ? arenaPosLane0Y.toFixed(3) : 'na'}),l1=(${Number.isFinite(arenaPosLane1X) ? arenaPosLane1X.toFixed(3) : 'na'},${Number.isFinite(arenaPosLane1Y) ? arenaPosLane1Y.toFixed(3) : 'na'}))`
        + ` | shapeInPlane=${Number.isFinite(firstShapeHandleWordOffset) ? String((firstShapeHandleWordOffset as number) < shapeBank.volatilePtr) : 'na'}`
        + ` | shape(indexCount=${Number.isFinite(firstShapeIndexCount) ? String(firstShapeIndexCount) : 'na'}, vertexCount=${Number.isFinite(firstShapeVertexCount) ? String(firstShapeVertexCount) : 'na'})`
        + ` | shapePoints=(${Number.isFinite(shapePointMinX) ? shapePointMinX.toFixed(3) : 'na'}..${Number.isFinite(shapePointMaxX) ? shapePointMaxX.toFixed(3) : 'na'},${Number.isFinite(shapePointMinY) ? shapePointMinY.toFixed(3) : 'na'}..${Number.isFinite(shapePointMaxY) ? shapePointMaxY.toFixed(3) : 'na'})`,
      );
    }

    state.frameCount = 0;
    state.lastFpsUpdate = now;
    state.minFrameTime = Infinity;
    state.maxFrameTime = 0;
    state.frameTimeSum = 0;
  }
}

/**
 * Start the animation loop.
 *
 * @returns Controller for lifecycle operations (stop + compile-success signal).
 */
export function startAnimationLoop(
  deps: AnimationLoopDeps,
  state: AnimationLoopState,
  onError: (err: unknown) => void
): AnimationLoopController {
  assertWebGPULoopContract(deps);
  // [LAW:single-enforcer] AnimationLoop owns runtime startup/compile boundaries,
  // so boundary checks are enforced here exactly once per published program.
  assertProgramPhaseBoundary(deps);

  let cancelled = false;
  let haltedByError = false;
  let rafId: number | null = null;

  const scheduleNextFrame = (): void => {
    if (cancelled || haltedByError || rafId !== null) {
      return;
    }
    rafId = requestAnimationFrame(animate);
  };

  function animate(tMs: number) {
    rafId = null;
    if (cancelled || haltedByError) return;
    try {
      executeAnimationFrame(tMs, deps, state);
    } catch (err) {
      // [LAW:single-enforcer] AnimationLoop is the single runtime boundary that fail-stops frame execution on exceptions.
      haltedByError = true;
      onError(err);
      return;
    }
    scheduleNextFrame();
  }

  scheduleNextFrame();

  return {
    stop: () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    onCompileSuccess: () => {
      if (cancelled) {
        return false;
      }
      assertProgramPhaseBoundary(deps);
      const resumedFromError = haltedByError;
      // [LAW:dataflow-not-control-flow] Recovery keeps the same frame pipeline and
      // resets only loop-owned runtime data when compilation publishes a new program.
      haltedByError = false;
      resetAnimationLoopState(state);
      scheduleNextFrame();
      return resumedFromError;
    },
  };
}
