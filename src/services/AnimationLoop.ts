/**
 * Animation Loop Service
 *
 * Manages the requestAnimationFrame loop, frame execution, rendering,
 * and performance metrics tracking.
 */

import { assertSchedulePhaseBoundaryStateReads, executeFrame, packDrawPrepSinkTableV1 } from '../runtime';
import { RenderBufferArena, type WebGPURenderer } from '../render';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RootStore } from '../stores';
import type { CompiledProgramIR } from '../compiler/ir/program';
import { isRuntimeConsoleEnabled } from '../testing/test-params';
import { markRuntimeFrameAdvanced } from '../testing/runtime-probe';

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
  getCurrentProgram: () => CompiledProgramIR | null;
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

interface ResolvedWebGPULoopRuntime {
  canvas: HTMLCanvasElement;
  renderer: WebGPURenderer;
  arena: RenderBufferArena;
}

interface RuntimeInputPlaneValues {
  inputMouseX: number;
  inputMouseY: number;
  inputMouseButtons: number;
  inputAudioLow: number;
  inputAudioMid: number;
  inputAudioHigh: number;
  inputGaugeActive: number;
}

const EMPTY_RUNTIME_INPUT_VALUES: RuntimeInputPlaneValues = Object.freeze({
  inputMouseX: 0,
  inputMouseY: 0,
  inputMouseButtons: 0,
  inputAudioLow: 0,
  inputAudioMid: 0,
  inputAudioHigh: 0,
  inputGaugeActive: 0,
});

function resolveWebGPULoopRuntime(deps: AnimationLoopDeps): ResolvedWebGPULoopRuntime {
  const canvas = deps.getCanvas();
  const renderer = deps.getRenderer();
  const arena = deps.getArena();

  if (!canvas || !renderer || !arena) {
    // [LAW:no-silent-fallbacks] Runtime loop must hard-fail when required
    // WebGPU rendering dependencies are missing.
    throw new Error('AnimationLoop: WebGPU runtime contract requires canvas, renderer, and arena');
  }

  return { canvas, renderer, arena };
}

function toHeldBit(value: number): number {
  return value > 0 ? 1 : 0;
}

function readRuntimeInputPlaneValues(currentState: RuntimeState | null): RuntimeInputPlaneValues {
  const channels = currentState?.externalChannels;
  if (!channels) {
    return EMPTY_RUNTIME_INPUT_VALUES;
  }

  // [LAW:single-enforcer] AnimationLoop is the frame boundary that commits
  // staged external writes exactly once before publishing runtime inputs.
  channels.commit();
  const snapshot = channels.snapshot;
  const leftHeld = toHeldBit(snapshot.getFloat('mouse.button.left.held'));
  const rightHeld = toHeldBit(snapshot.getFloat('mouse.button.right.held'));

  // [LAW:dataflow-not-control-flow] Runtime input publication always writes the
  // same input envelope each frame; external channels only vary field values.
  return {
    inputMouseX: snapshot.getFloat('mouse.x'),
    inputMouseY: snapshot.getFloat('mouse.y'),
    inputMouseButtons: leftHeld | (rightHeld << 1),
    inputAudioLow: snapshot.getFloat('audio.low'),
    inputAudioMid: snapshot.getFloat('audio.mid'),
    inputAudioHigh: snapshot.getFloat('audio.high'),
    inputGaugeActive: snapshot.getFloat('gauge.active'),
  };
}

const RUNTIME_CONSOLE_ENABLED = isRuntimeConsoleEnabled();
const EMPTY_U32_WORDS = new Uint32Array(0);

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
 * same runtime execute + render publication order; worker-owned telemetry
 * drives observability while value variability flows through runtime state.
 */
export function executeAnimationFrame(
  tMs: number,
  deps: AnimationLoopDeps,
  state: AnimationLoopState
): void {
  const {
    getCurrentProgram,
    getCurrentState,
    store,
    onStatsUpdate,
  } = deps;

  const { canvas, renderer, arena } = resolveWebGPULoopRuntime(deps);
  const currentProgram = getCurrentProgram();
  const currentState = getCurrentState();
  if (!currentProgram || !currentState) {
    return;
  }

  const runtimeInputPlaneValues = readRuntimeInputPlaneValues(currentState);
  const { zoom, pan } = store.viewport;
  const renderWidth = Math.max(1, Math.floor(store.viewport.canvasWidth || canvas.width));
  const renderHeight = Math.max(1, Math.floor(store.viewport.canvasHeight || canvas.height));
  arena.beginFrame();
  try {
    renderer.resizeCanvas(renderWidth, renderHeight);
    executeFrame(currentProgram, currentState, arena, tMs);
    const packedSinkTable = packDrawPrepSinkTableV1(currentProgram, currentState);
    // [LAW:single-enforcer] AnimationLoop is the per-frame boundary that
    // executes runtime + publishes hotpath planes into renderer transport.
    renderer.render({
      arenaWords: currentState.arena,
      arenaWordCount: currentState.arena.length,
      shapeBank: {
        data: currentState.shapeBank.data,
        volatilePtr: currentState.shapeBank.volatilePtr,
        staticBoundary: currentState.shapeBank.staticBoundary,
        topologyIdByHandle: currentState.shapeBank.topologyIdByHandle,
      },
      drawPrepSinkTableV1: packedSinkTable?.words ?? EMPTY_U32_WORDS,
      drawPrepSinkTableWordCount: packedSinkTable?.wordCount ?? 0,
      width: renderWidth,
      height: renderHeight,
      zoom,
      panX: pan.x,
      panY: pan.y,
      timeMs: tMs,
      inputMouseX: runtimeInputPlaneValues.inputMouseX,
      inputMouseY: runtimeInputPlaneValues.inputMouseY,
      inputMouseButtons: runtimeInputPlaneValues.inputMouseButtons,
      inputAudioLow: runtimeInputPlaneValues.inputAudioLow,
      inputAudioMid: runtimeInputPlaneValues.inputAudioMid,
      inputAudioHigh: runtimeInputPlaneValues.inputAudioHigh,
      inputGaugeActive: runtimeInputPlaneValues.inputGaugeActive,
    });
    markRuntimeFrameAdvanced(currentState.cache.frameId, tMs);
  } finally {
    // [LAW:single-enforcer] Frame arena lifecycle is owned at the animation-loop
    // boundary so begin/end stay paired even when frame publication throws.
    arena.endFrame();
  }

  state.frameCount++;
  const now = performance.now();
  if (now - state.lastFpsUpdate > 500) {
    state.fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsUpdate));
    const schedulerState = renderer.getLifecycleState();
    const telemetry = renderer.getLatestRuntimeTelemetry();
    const drawOps = telemetry?.resourceStats.totalInstanceCount ?? 0;
    const tickMs = telemetry?.stageTimings.totalFrameMs ?? telemetry?.meanMs ?? 0;
    const statsText = `FPS: ${state.fps} | DrawOps: ${drawOps} | `
      + `Tick: ${tickMs.toFixed(1)}ms`;
    onStatsUpdate?.(statsText);
    if (RUNTIME_CONSOLE_ENABLED) {
      const programScheduleSteps = Array.isArray(currentProgram?.schedule?.steps) ? currentProgram.schedule.steps : [];
      const renderStepCount = programScheduleSteps.filter((step: { kind?: string }) => step?.kind === 'render').length;
      const installedGpuPassIds =
        typeof renderer.getInstalledGpuPassIds === 'function' ? renderer.getInstalledGpuPassIds() : [];
      const rendererSinkTableSample =
        typeof renderer.getLatestSinkTableSample === 'function' ? renderer.getLatestSinkTableSample() : null;
      const sinkTableSample = rendererSinkTableSample ?? null;
      const schedulerFrameCount = telemetry?.frameCount ?? 0;
      const overheadDispatches = 2; // instance assembly + draw-prep
      const simulationPassCount = telemetry?.dispatchCounters.computeDispatchCount
        ? Math.max(1, telemetry.dispatchCounters.computeDispatchCount - overheadDispatches)
        : Math.max(1, installedGpuPassIds.length);
      // [LAW:one-source-of-truth] Expected ping/pong parity derives from
      // the canonical simulation pass count emitted by runtime telemetry.
      const expectedPingPongIndexFromParity = (schedulerFrameCount * simulationPassCount) & 1;
      const line = {
        kind: 'runtime-heartbeat',
        fps: state.fps,
        stats: {
          drawOps,
          lastTickMs: tickMs,
          meanTickMs: telemetry?.meanMs ?? 0,
          sinkWords: telemetry?.resourceStats.sinkTableWordCount ?? 0,
          frameCount: telemetry?.frameCount ?? 0,
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
  resolveWebGPULoopRuntime(deps);
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
