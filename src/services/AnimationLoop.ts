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
import type { CompiledProgramIR } from '../compiler/ir/program';
import { isRuntimeConsoleEnabled } from '../testing/test-params';
import {
  markRuntimeFrameAdvanced,
  markRuntimeHeartbeat,
  shouldEnableRuntimeProbe,
  type RuntimeProbeHeartbeat,
} from '../testing/runtime-probe';

export interface AnimationLoopState {
  frameCount: number;
  lastFpsUpdate: number;
  lastTelemetryLogAt: number;
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
const FPS_UPDATE_INTERVAL_MS = 500;
const TELEMETRY_LOG_INTERVAL_MS = 5000;
const TELEMETRY_INITIAL_LOG_AT = 0;

type RuntimeTelemetrySnapshot = ReturnType<WebGPURenderer['getLatestRuntimeTelemetry']>;
type RuntimeTelemetryValue = NonNullable<RuntimeTelemetrySnapshot>;

interface RuntimeHeartbeatConsumers {
  readonly probeEnabled: boolean;
  readonly consoleEnabled: boolean;
  readonly hasAnyConsumer: boolean;
}

function shouldRunFpsCadence(now: number, lastFpsUpdate: number): boolean {
  return now - lastFpsUpdate > FPS_UPDATE_INTERVAL_MS;
}

function readRuntimeHeartbeatConsumers(): RuntimeHeartbeatConsumers {
  const probeEnabled = shouldEnableRuntimeProbe();
  return {
    probeEnabled,
    consoleEnabled: RUNTIME_CONSOLE_ENABLED,
    hasAnyConsumer: probeEnabled || RUNTIME_CONSOLE_ENABLED,
  };
}

function formatStatsText(fps: number, drawOps: number, tickMs: number): string {
  return `FPS: ${fps} | DrawOps: ${drawOps} | Tick: ${tickMs.toFixed(1)}ms`;
}

interface RuntimeTelemetryLogInputs {
  store: RootStore;
  state: AnimationLoopState;
  now: number;
  schedulerState: string;
  fps: number;
  telemetry: RuntimeTelemetrySnapshot;
}

function maybeLogRuntimeTelemetry(inputs: RuntimeTelemetryLogInputs): void {
  const {
    store,
    state,
    now,
    schedulerState,
    fps,
    telemetry,
  } = inputs;
  if (!telemetry) {
    return;
  }
  const shouldPublish = state.lastTelemetryLogAt === TELEMETRY_INITIAL_LOG_AT
    || (now - state.lastTelemetryLogAt) >= TELEMETRY_LOG_INTERVAL_MS;
  if (!shouldPublish) {
    return;
  }
  // [LAW:single-enforcer] AnimationLoop is the one UI-facing bridge that
  // publishes runtime heartbeat telemetry to diagnostics consumers.
  store.diagnostics.log({
    level: 'debug',
    message: `Runtime telemetry heartbeat (${schedulerState})`,
    data: {
      kind: 'runtimeTelemetry',
      schedulerState,
      fps,
      telemetry: {
        meanMs: telemetry.meanMs,
        stdDevMs: telemetry.stdDevMs,
        sampleCount: telemetry.sampleCount,
        frameCount: telemetry.frameCount,
        stageTimings: telemetry.stageTimings,
        dispatchCounters: telemetry.dispatchCounters,
        resourceStats: telemetry.resourceStats,
        lastEvent: telemetry.lastEvent,
      },
    },
  });
  state.lastTelemetryLogAt = now;
}

function computeSimulationPassCount(
  telemetry: RuntimeTelemetrySnapshot,
  installedGpuPassIds: readonly string[],
): number {
  const overheadDispatches = 2; // instance assembly + draw-prep
  if (telemetry?.dispatchCounters.computeDispatchCount) {
    return Math.max(1, telemetry.dispatchCounters.computeDispatchCount - overheadDispatches);
  }
  return Math.max(1, installedGpuPassIds.length);
}

function readInstalledGpuPassIds(renderer: WebGPURenderer): readonly string[] {
  return typeof renderer.getInstalledGpuPassIds === 'function' ? renderer.getInstalledGpuPassIds() : [];
}

function readSinkTableSample(renderer: WebGPURenderer): ReturnType<WebGPURenderer['getLatestSinkTableSample']> {
  return typeof renderer.getLatestSinkTableSample === 'function' ? renderer.getLatestSinkTableSample() : null;
}

interface RuntimeHeartbeatInputs {
  currentProgram: CompiledProgramIR;
  store: RootStore;
  renderer: WebGPURenderer;
  schedulerState: string;
  fps: number;
  drawOps: number;
  tickMs: number;
  telemetry: RuntimeTelemetrySnapshot;
}

function readRuntimeHeartbeatInputs(
  currentProgram: CompiledProgramIR,
  store: RootStore,
  renderer: WebGPURenderer,
  fps: number,
): RuntimeHeartbeatInputs {
  const schedulerState = renderer.getLifecycleState();
  const telemetry = renderer.getLatestRuntimeTelemetry();
  const drawOps = telemetry?.resourceStats.totalInstanceCount ?? 0;
  const tickMs = telemetry?.stageTimings.totalFrameMs ?? telemetry?.meanMs ?? 0;
  return {
    currentProgram,
    store,
    renderer,
    schedulerState,
    fps,
    drawOps,
    tickMs,
    telemetry,
  };
}

function readProgramScheduleSteps(currentProgram: CompiledProgramIR): readonly { kind?: string }[] {
  return Array.isArray(currentProgram.schedule?.steps) ? currentProgram.schedule.steps : [];
}

function buildRuntimeHeartbeatStats(
  telemetry: RuntimeTelemetrySnapshot,
  drawOps: number,
  tickMs: number,
): RuntimeProbeHeartbeat['stats'] {
  return {
    drawOps,
    lastTickMs: tickMs,
    meanTickMs: telemetry?.meanMs ?? 0,
    sinkWords: telemetry?.resourceStats.sinkTableWordCount ?? 0,
    frameCount: telemetry?.frameCount ?? 0,
  };
}

function buildRuntimeHeartbeatTelemetry(
  telemetry: RuntimeTelemetrySnapshot,
): RuntimeProbeHeartbeat['telemetry'] {
  if (!telemetry) {
    return null;
  }
  return {
    stageTimings: telemetry.stageTimings,
    dispatchCounters: telemetry.dispatchCounters,
    resourceStats: telemetry.resourceStats,
  };
}

function buildRuntimeHeartbeatRuntime(
  currentProgram: CompiledProgramIR,
  store: RootStore,
  telemetry: RuntimeTelemetrySnapshot,
  installedGpuPassIds: readonly string[],
  sinkTableSample: ReturnType<WebGPURenderer['getLatestSinkTableSample']>,
): RuntimeProbeHeartbeat['runtime'] {
  const renderStepCount = readProgramScheduleSteps(currentProgram).filter((step) => step?.kind === 'render').length;
  const schedulerFrameCount = telemetry?.frameCount ?? 0;
  const simulationPassCount = computeSimulationPassCount(telemetry, installedGpuPassIds);
  // [LAW:one-source-of-truth] Expected ping/pong parity derives from
  // the canonical simulation pass count emitted by runtime telemetry.
  const expectedPingPongIndexFromParity = (schedulerFrameCount * simulationPassCount) & 1;
  return {
    demoFilename: store.demo.currentFilename ?? null,
    renderStepCount,
    drawPrepSinkCount: currentProgram.drawPrepProgram.sinks.length,
    installedGpuPassIds,
    sinkTableSample,
    schedulerFrameCount,
    simulationPassCount,
    expectedPingPongIndexFromParity,
  };
}

function buildRuntimeHeartbeat(inputs: RuntimeHeartbeatInputs): RuntimeProbeHeartbeat {
  const {
    currentProgram,
    store,
    renderer,
    schedulerState,
    fps,
    drawOps,
    tickMs,
    telemetry,
  } = inputs;
  const installedGpuPassIds = readInstalledGpuPassIds(renderer);
  const sinkTableSample = readSinkTableSample(renderer);
  const runtime = buildRuntimeHeartbeatRuntime(
    currentProgram,
    store,
    telemetry,
    installedGpuPassIds,
    sinkTableSample,
  );
  // [LAW:one-source-of-truth] Preview probes and runtimeConsole consume the
  // same canonical heartbeat payload instead of rebuilding parallel views.
  return {
    kind: 'runtime-heartbeat',
    fps,
    stats: buildRuntimeHeartbeatStats(telemetry, drawOps, tickMs),
    scheduler: schedulerState,
    telemetry: buildRuntimeHeartbeatTelemetry(telemetry),
    runtime,
    breadcrumb: telemetry?.lastEvent ?? null,
  };
}

function emitRuntimeConsoleHeartbeat(
  heartbeat: RuntimeProbeHeartbeat,
  consumers: RuntimeHeartbeatConsumers,
): void {
  if (!consumers.consoleEnabled) {
    return;
  }
  // [LAW:one-source-of-truth] Runtime console emits one canonical JSON
  // heartbeat line so DevTools/MCP parsing never depends on ad-hoc strings.
  console.info(`[runtimeConsole] ${JSON.stringify(heartbeat)}`);
}

interface FpsCadenceInputs {
  cadenceDue: boolean;
  heartbeatConsumers: RuntimeHeartbeatConsumers;
  now: number;
  state: AnimationLoopState;
  currentProgram: CompiledProgramIR;
  renderer: WebGPURenderer;
  store: RootStore;
  onStatsUpdate?: (statsText: string) => void;
}

function runFpsCadence({
  cadenceDue,
  heartbeatConsumers,
  now,
  state,
  currentProgram,
  renderer,
  store,
  onStatsUpdate,
}: FpsCadenceInputs): void {
  if (!cadenceDue) {
    return;
  }
  state.fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsUpdate));
  const heartbeatInputs = readRuntimeHeartbeatInputs(currentProgram, store, renderer, state.fps);
  onStatsUpdate?.(formatStatsText(state.fps, heartbeatInputs.drawOps, heartbeatInputs.tickMs));
  maybeLogRuntimeTelemetry({
    store,
    state,
    now,
    schedulerState: heartbeatInputs.schedulerState,
    fps: state.fps,
    telemetry: heartbeatInputs.telemetry,
  });
  if (heartbeatConsumers.hasAnyConsumer) {
    const heartbeat = buildRuntimeHeartbeat(heartbeatInputs);
    if (heartbeatConsumers.probeEnabled) {
      markRuntimeHeartbeat(heartbeat, now);
    }
    emitRuntimeConsoleHeartbeat(heartbeat, heartbeatConsumers);
  }
  state.frameCount = 0;
  state.lastFpsUpdate = now;
  state.minFrameTime = Infinity;
  state.maxFrameTime = 0;
  state.frameTimeSum = 0;
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
    lastTelemetryLogAt: TELEMETRY_INITIAL_LOG_AT,
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
  state.lastTelemetryLogAt = next.lastTelemetryLogAt;
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
    getCurrentState,
    store,
    onStatsUpdate,
  } = deps;

  const { canvas, renderer, arena } = resolveWebGPULoopRuntime(deps);
  const currentProgram = getCurrentProgram();
  if (!currentProgram) {
    return;
  }

  const runtimeInputPlaneValues = readRuntimeInputPlaneValues(getCurrentState());
  const { zoom, pan } = store.viewport;
  const renderWidth = Math.max(1, Math.floor(store.viewport.canvasWidth || canvas.width));
  const renderHeight = Math.max(1, Math.floor(store.viewport.canvasHeight || canvas.height));
  arena.beginFrame();
  try {
    renderer.resizeCanvas(renderWidth, renderHeight);
    // [LAW:single-enforcer] Renderer worker is the one runtime-input boundary;
    // animation loop publishes viewport/time there and does not dual-publish to
    // any secondary runtime worker seam.
    renderer.setViewportFrame({
      width: renderWidth,
      height: renderHeight,
      zoom,
      panX: pan.x,
      panY: pan.y,
      timeMs: tMs,
      ...runtimeInputPlaneValues,
    });
    markRuntimeFrameAdvanced(-1, tMs);
  } finally {
    // [LAW:single-enforcer] Frame arena lifecycle is owned at the animation-loop
    // boundary so begin/end stay paired even when frame publication throws.
    arena.endFrame();
  }

  state.frameCount++;
  const now = performance.now();
  const heartbeatConsumers = readRuntimeHeartbeatConsumers();
  const cadenceDue = shouldRunFpsCadence(now, state.lastFpsUpdate);
  if (heartbeatConsumers.probeEnabled && !cadenceDue) {
    // [LAW:one-source-of-truth] Probe/console consumers read the same live
    // renderer heartbeat payload when enabled instead of reconstructing
    // runtime state from throttled logs.
    // [LAW:single-enforcer] AnimationLoop evaluates preview-consumer state at
    // the frame boundary so showPreview changes take effect without a second
    // cached heartbeat gate drifting from runtime-probe behavior.
    markRuntimeHeartbeat(
      buildRuntimeHeartbeat(readRuntimeHeartbeatInputs(currentProgram, store, renderer, state.fps)),
      now,
    );
  }
  runFpsCadence({
    cadenceDue,
    heartbeatConsumers,
    now,
    state,
    currentProgram,
    renderer,
    store,
    onStatsUpdate,
  });
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
