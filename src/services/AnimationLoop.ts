/**
 * Animation Loop Service
 *
 * Manages the requestAnimationFrame loop, frame execution, rendering,
 * and performance metrics tracking.
 */

import { assertSchedulePhaseBoundaryStateReads } from '../runtime';
import { RenderBufferArena, type WebGPURenderer } from '../render';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RootStore } from '../stores';
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

const RUNTIME_CONSOLE_ENABLED = isRuntimeConsoleEnabled();

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
 * Execute a single animation frame.
 *
 * [LAW:dataflow-not-control-flow] Main-thread execution always performs the
 * same viewport publication + telemetry read; worker-owned runtime data drives
 * variability through shared planes and scheduler packets.
 */
export function executeAnimationFrame(
  tMs: number,
  deps: AnimationLoopDeps,
  state: AnimationLoopState
): void {
  const {
    getCurrentProgram,
    getCanvas,
    getRenderer,
    getRuntimeHotpath,
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
  if (!runtimeHotpath) {
    // [LAW:no-mode-explosion] CPU executeFrame playback fallback is deleted;
    // runtime playback must use one worker-owned hot path.
    // TODO(steel-thread): Move runtime-hotpath responsibilities into renderer
    // worker once compiled GPU artifact bundles own full frame execution.
    throw new Error('AnimationLoop: runtime hotpath worker is required (CPU fallback removed)');
  }

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
  markRuntimeFrameAdvanced(-1, tMs);

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
      const programScheduleSteps = Array.isArray(currentProgram?.schedule?.steps) ? currentProgram.schedule.steps : [];
      const renderStepCount = programScheduleSteps.filter((step: { kind?: string }) => step?.kind === 'render').length;
      const installedGpuPassIds =
        typeof renderer.getInstalledGpuPassIds === 'function' ? renderer.getInstalledGpuPassIds() : [];
      const rendererSinkTableSample =
        typeof renderer.getLatestSinkTableSample === 'function' ? renderer.getLatestSinkTableSample() : null;
      const sinkTableSample = workerStats?.sinkTableSample ?? rendererSinkTableSample ?? null;
      const schedulerFrameCount = telemetry?.frameCount ?? 0;
      const simulationPassCount = telemetry?.dispatchCounters.computeDispatchCount
        ? Math.max(1, telemetry.dispatchCounters.computeDispatchCount - 1)
        : Math.max(1, installedGpuPassIds.length);
      // [LAW:one-source-of-truth] Expected ping/pong parity derives from
      // the canonical simulation pass count emitted by runtime telemetry.
      const expectedPingPongIndexFromParity = (schedulerFrameCount * simulationPassCount) & 1;
      const line = {
        kind: 'runtime-heartbeat',
        fps: state.fps,
        stats: {
          drawOps: workerStats?.drawOpCount ?? 0,
          lastTickMs: workerStats?.lastTickMs ?? 0,
          meanTickMs: workerStats?.meanTickMs ?? telemetry?.meanMs ?? 0,
          sinkWords: workerStats?.sinkWordCount ?? telemetry?.resourceStats.sinkTableWordCount ?? 0,
          frameCount: workerStats?.frameCount ?? telemetry?.frameCount ?? 0,
        },
        scheduler: schedulerState,
        telemetry: telemetry ? {
          stageTimings: telemetry.stageTimings,
          dispatchCounters: telemetry.dispatchCounters,
          resourceStats: telemetry.resourceStats,
        } : null,
        runtime: {
          demoFilename: store.demo.currentFilename ?? null,
          renderStepCount,
          drawPrepSinkCount: currentProgram?.drawPrepProgram?.sinks?.length ?? 0,
          installedGpuPassIds,
          sinkTableSample,
          schedulerFrameCount,
          simulationPassCount,
          expectedPingPongIndexFromParity,
        },
        breadcrumb: telemetry?.lastEvent ?? null,
      };
      // [LAW:one-source-of-truth] Runtime console emits one canonical JSON
      // heartbeat line so DevTools/MCP parsing never depends on ad-hoc strings.
      console.info(`[runtimeConsole] ${JSON.stringify(line)}`);
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
