/**
 * Animation Loop Service
 *
 * Manages the requestAnimationFrame loop, frame execution, rendering,
 * and performance metrics tracking.
 */

import { assertSchedulePhaseBoundaryStateReads, executeFrame } from '../runtime';
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
  const { getCurrentProgram, getCurrentState, getCanvas, getRenderer, getArena, store, onStatsUpdate } = deps;

  const currentProgram = getCurrentProgram();
  const currentState = getCurrentState();
  const canvas = getCanvas();
  const renderer = getRenderer();
  const arena = getArena();

  if (!canvas || !renderer || !arena) {
    throw new Error('AnimationLoop: WebGPU runtime contract requires canvas, renderer, and arena');
  }

  if (!currentProgram || !currentState) {
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
  // [LAW:one-source-of-truth] The active draw-prep shader comes from the
  // compiled program contract; renderer selection has one canonical source.
  const drawPrepShaderWgsl = currentProgram?.drawPrepProgram?.wgsl;
  const inputChannels = resolveRendererInputChannels(currentState);
  renderer.render({
    frame: frameToRender,
    width: canvas.width,
    height: canvas.height,
    zoom,
    panX: pan.x,
    panY: pan.y,
    timeMs: tMs,
    ...inputChannels,
    drawPrepShaderWgsl,
  });
  state.renderTime = performance.now() - renderStart;

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
