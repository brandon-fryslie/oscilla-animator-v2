/**
 * Runtime Probe (test automation only)
 *
 * Exposes machine-readable runtime bootstrap/frame progress for browser gates.
 * The probe is only published for `showPreview=true|1` sessions.
 */

export const RUNTIME_PROBE_GLOBAL_KEY = '__OSCILLA_RUNTIME_PROBE__' as const;

type BootstrapState = 'not_started' | 'starting' | 'succeeded' | 'failed';

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
