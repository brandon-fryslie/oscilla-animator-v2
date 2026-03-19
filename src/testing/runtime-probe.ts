/**
 * Runtime Probe (test automation only)
 *
 * Exposes machine-readable runtime bootstrap/frame progress for browser gates.
 * The probe is only published for `showPreview=true|1` sessions.
 */
export const RUNTIME_PROBE_GLOBAL_KEY = '__OSCILLA_RUNTIME_PROBE__' as const;

type BootstrapState = 'not_started' | 'starting' | 'succeeded' | 'failed';

export interface RuntimeProbeHeartbeat {
  readonly kind: 'runtime-heartbeat';
  readonly fps: number;
  readonly stats: {
    readonly drawOps: number;
    readonly lastTickMs: number;
    readonly meanTickMs: number;
    readonly sinkWords: number;
    readonly frameCount: number;
  };
  readonly scheduler: string;
  readonly telemetry: {
    readonly stageTimings: {
      readonly inputMarshalMs: number;
      readonly simulationDispatchMs: number;
      readonly fluidPassChainMs: number;
      readonly drawPrepMs: number;
      readonly renderMs: number;
      readonly swapMs: number;
      readonly totalFrameMs: number;
    };
    readonly dispatchCounters: {
      readonly computeDispatchCount: number;
      readonly computeWorkgroupCount: number;
      readonly activeLaneCount: number;
      readonly guardedLaneCount: number;
    };
    readonly resourceStats: {
      readonly shapeBankWordCount: number;
      readonly sinkTableWordCount: number;
      readonly indexedRecordCount: number;
      readonly nonIndexedRecordCount: number;
      readonly totalInstanceCount: number;
      readonly canvasWidth: number;
      readonly canvasHeight: number;
      readonly pingPongIndex: number;
    };
  } | null;
  readonly runtime: {
    readonly demoFilename: string | null;
    readonly renderStepCount: number;
    readonly drawPrepSinkCount: number;
    readonly installedGpuPassIds: readonly string[];
    readonly sinkTableSample: unknown;
    readonly schedulerFrameCount: number;
    readonly simulationPassCount: number;
    readonly expectedPingPongIndexFromParity: number;
  };
  readonly breadcrumb: unknown;
}

export interface RuntimeProbeSnapshot {
  readonly version: 1;
  bootstrap: {
    state: BootstrapState;
    startedAtMs: number | null;
    finishedAtMs: number | null;
    failureMessage: string | null;
  };
  loop: {
    renderedFrameCount: number;
    lastFrameId: number | null;
    lastFrameAtMs: number | null;
  };
  heartbeat: {
    publishedAtMs: number | null;
    latest: RuntimeProbeHeartbeat | null;
  };
}

function shouldEnableRuntimeProbe(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const value = new URLSearchParams(window.location.search).get('showPreview');
  return value === 'true' || value === '1';
}

function ensureRuntimeProbe(): RuntimeProbeSnapshot | null {
  if (!shouldEnableRuntimeProbe()) {
    return null;
  }
  const host = globalThis as typeof globalThis & {
    [RUNTIME_PROBE_GLOBAL_KEY]?: RuntimeProbeSnapshot;
  };
  const existing = host[RUNTIME_PROBE_GLOBAL_KEY];
  if (existing && existing.version === 1) {
    return existing;
  }
  const created: RuntimeProbeSnapshot = {
    version: 1,
    bootstrap: {
      state: 'not_started',
      startedAtMs: null,
      finishedAtMs: null,
      failureMessage: null,
    },
    loop: {
      renderedFrameCount: 0,
      lastFrameId: null,
      lastFrameAtMs: null,
    },
    heartbeat: {
      publishedAtMs: null,
      latest: null,
    },
  };
  // [LAW:single-enforcer] Runtime probe publication is centralized in this
  // module so browser gate readers consume one canonical probe shape.
  host[RUNTIME_PROBE_GLOBAL_KEY] = created;
  return created;
}

export { ensureRuntimeProbe, shouldEnableRuntimeProbe };

export function markRuntimeBootstrapStarted(nowMs: number = performance.now()): void {
  const probe = ensureRuntimeProbe();
  if (!probe) {
    return;
  }
  probe.bootstrap.state = 'starting';
  probe.bootstrap.startedAtMs = nowMs;
  probe.bootstrap.finishedAtMs = null;
  probe.bootstrap.failureMessage = null;
  probe.heartbeat.publishedAtMs = null;
  probe.heartbeat.latest = null;
}

export function markRuntimeBootstrapSucceeded(nowMs: number = performance.now()): void {
  const probe = ensureRuntimeProbe();
  if (!probe) {
    return;
  }
  probe.bootstrap.state = 'succeeded';
  probe.bootstrap.finishedAtMs = nowMs;
  probe.bootstrap.failureMessage = null;
}

export function markRuntimeBootstrapFailed(
  failureMessage: string,
  nowMs: number = performance.now(),
): void {
  const probe = ensureRuntimeProbe();
  if (!probe) {
    return;
  }
  probe.bootstrap.state = 'failed';
  probe.bootstrap.finishedAtMs = nowMs;
  probe.bootstrap.failureMessage = failureMessage;
}

export function markRuntimeFrameAdvanced(
  frameId: number,
  nowMs: number = performance.now(),
): void {
  const probe = ensureRuntimeProbe();
  if (!probe) {
    return;
  }
  probe.loop.renderedFrameCount += 1;
  probe.loop.lastFrameId = frameId;
  probe.loop.lastFrameAtMs = nowMs;
}

export function markRuntimeHeartbeat(
  heartbeat: RuntimeProbeHeartbeat,
  nowMs: number = performance.now(),
): void {
  const probe = ensureRuntimeProbe();
  if (!probe) {
    return;
  }
  // [LAW:one-source-of-truth] Preview telemetry consumers read one canonical
  // heartbeat payload instead of reconstructing runtime state from logs.
  probe.heartbeat.publishedAtMs = nowMs;
  probe.heartbeat.latest = heartbeat;
}
