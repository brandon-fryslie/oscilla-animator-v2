/**
 * Animation Loop Service
 *
 * Manages the requestAnimationFrame loop, frame execution, rendering,
 * and performance metrics tracking.
 */

import { BufferPool, executeFrame } from '../runtime';
import { renderFrame } from '../render';
import {
  recordFrameTime,
  recordFrameDelta,
  shouldEmitSnapshot,
  emitHealthSnapshot,
  computeFrameTimingStats,
  resetFrameTimingStats,
} from '../runtime/HealthMonitor';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RootStore } from '../stores';

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
  getPool: () => BufferPool | null;
  store: RootStore;
  onStatsUpdate?: (statsText: string) => void;
}

const CONTINUITY_STORE_UPDATE_INTERVAL = 200; // 5Hz

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
 * Execute a single animation frame
 */
export function executeAnimationFrame(
  tMs: number,
  deps: AnimationLoopDeps,
  state: AnimationLoopState
): void {
  const { getCurrentProgram, getCurrentState, getCanvas, getContext, getPool, store, onStatsUpdate } = deps;

  const currentProgram = getCurrentProgram();
  const currentState = getCurrentState();
  const ctx = getContext();
  const canvas = getCanvas();
  const pool = getPool();

  if (!currentProgram || !currentState || !ctx || !canvas || !pool) {
    return;
  }

  // Record frame delta FIRST (using rAF timestamp for precision)
  recordFrameDelta(currentState, tMs);

  const frameStart = performance.now();

  // Execute frame (camera resolved from program.renderGlobals)
  const execStart = performance.now();
  const frame = executeFrame(currentProgram, currentState, pool, tMs);
  state.execTime = performance.now() - execStart;

  // Render to canvas with zoom/pan transform from store
  const renderStart = performance.now();
  const { zoom, pan } = store.viewport;

  // Clear in device space (identity transform) to avoid ghosting/trails
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply camera transform and draw scene
  ctx.save();
  ctx.translate(canvas.width / 2 + pan.x * zoom, canvas.height / 2 + pan.y * zoom);
  ctx.scale(zoom, zoom);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  renderFrame(ctx, frame, canvas.width, canvas.height, /* skipClear */ true);
  ctx.restore();
  state.renderTime = performance.now() - renderStart;

  // Release all buffers back to pool for reuse next frame
  pool.releaseAll();

  // Calculate frame time
  const frameTime = performance.now() - frameStart;

  // Record health metrics
  recordFrameTime(currentState, frameTime);

  // Emit health snapshot if throttle interval elapsed
  if (shouldEmitSnapshot(currentState)) {
    // Compute frame timing stats before emitting
    const timingStats = computeFrameTimingStats(currentState);

    // Update diagnostics store with timing stats
    store.diagnostics.updateFrameTiming(timingStats);

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
    const totalElements = frame.ops.reduce((sum: number, op) => sum + op.instances.count, 0);
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
 * Start the animation loop
 */
export function startAnimationLoop(
  deps: AnimationLoopDeps,
  state: AnimationLoopState,
  onError?: (err: unknown) => void
): void {
  function animate(tMs: number) {
    try {
      executeAnimationFrame(tMs, deps, state);
    } catch (err) {
      if (onError) {
        onError(err);
      } else {
        console.error('Runtime error:', err);
      }
    }
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
