/**
 * Animation Loop Service
 *
 * Manages the requestAnimationFrame loop, frame execution, rendering,
 * and performance metrics tracking.
 */

import { executeFrame } from '../runtime';
import { renderFrame, RenderBufferArena } from '../render';
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
import type { ContentBounds } from '../stores/ViewportStore';

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
  getContext: () => CanvasRenderingContext2D | null;
  getArena: () => RenderBufferArena | null;
  store: RootStore;
  onStatsUpdate?: (statsText: string) => void;
}

const CONTINUITY_STORE_UPDATE_INTERVAL = 200; // 5Hz

/**
 * Calculate content bounds from a render frame.
 * Returns bounds in world space (normalized [0,1] coordinates).
 */
function calculateContentBounds(frame: RenderFrameIR): ContentBounds | null {
  if (frame.ops.length === 0) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const op of frame.ops) {
    const { instances } = op;
    const { position, count } = instances;

    // Process each instance - just track positions without size padding for now
    for (let i = 0; i < count; i++) {
      // Position in normalized [0,1] space
      const normX = position[i * 2];
      const normY = position[i * 2 + 1];

      minX = Math.min(minX, normX);
      maxX = Math.max(maxX, normX);
      minY = Math.min(minY, normY);
      maxY = Math.max(maxY, normY);
    }
  }

  // Add a small padding (5% of content size) to account for instance sizes
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const paddingX = contentWidth * 0.05;
  const paddingY = contentHeight * 0.05;

  minX -= paddingX;
  maxX += paddingX;
  minY -= paddingY;
  maxY += paddingY;

  // Return null if no valid bounds found
  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
    return null;
  }

  return { minX, maxX, minY, maxY };
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
  const frame = executeFrame(currentProgram, currentState, arena, tMs);
  const execTimeMs = performance.now() - execStart;
  return { frame, execTimeMs };
}

/**
 * Execute a single animation frame.
 *
 * [LAW:dataflow-not-control-flow] The pipeline (clear, transform, render, metrics, continuity, FPS)
 * always runs in the same order. Only the frame source varies (via acquireFrame).
 * Null frame = empty collection (no ops to draw), not control-flow branching.
 */
export function executeAnimationFrame(
  tMs: number,
  deps: AnimationLoopDeps,
  state: AnimationLoopState
): void {
  const { getCurrentProgram, getCurrentState, getCanvas, getContext, getArena, store, onStatsUpdate } = deps;

  const currentProgram = getCurrentProgram();
  const currentState = getCurrentState();
  const ctx = getContext();
  const canvas = getCanvas();
  const arena = getArena();

  if (!currentProgram || !currentState || !ctx || !canvas || !arena) {
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

  // Render to canvas with zoom/pan transform from store
  const renderStart = performance.now();
  const { zoom, pan } = store.viewport;

  // Clear in device space (identity transform) to avoid ghosting/trails
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render frame if available (null = no ops to draw, not control-flow branching)
  if (frame) {
    ctx.save();
    ctx.translate(canvas.width / 2 + pan.x * zoom, canvas.height / 2 + pan.y * zoom);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    renderFrame(ctx, frame, canvas.width, canvas.height);
    ctx.restore();
  }
  state.renderTime = performance.now() - renderStart;

  // Update content bounds in viewport store (for zoom-to-fit feature)
  const bounds = frame ? calculateContentBounds(frame) : null;
  store.viewport.setContentBounds(bounds);

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
      pooledBytes: arena.getTotalAllocatedBytes(),
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
    const totalElements = frame
      ? frame.ops.reduce((sum: number, op) => sum + op.instances.count, 0)
      : 0;
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
 * @returns Cancel function — call it to stop the loop (e.g., on HMR dispose).
 */
export function startAnimationLoop(
  deps: AnimationLoopDeps,
  state: AnimationLoopState,
  onError?: (err: unknown) => void
): () => void {
  let cancelled = false;
  let rafId = 0;

  function animate(tMs: number) {
    if (cancelled) return;
    try {
      executeAnimationFrame(tMs, deps, state);
    } catch (err) {
      if (onError) {
        onError(err);
      } else {
        console.error('Runtime error:', err);
      }
    }
    if (!cancelled) {
      rafId = requestAnimationFrame(animate);
    }
  }

  rafId = requestAnimationFrame(animate);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
