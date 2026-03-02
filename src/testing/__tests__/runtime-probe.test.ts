import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  markRuntimeBootstrapFailed,
  markRuntimeBootstrapStarted,
  markRuntimeBootstrapSucceeded,
  markRuntimeFrameAdvanced,
  RUNTIME_PROBE_GLOBAL_KEY,
} from '../runtime-probe';

type ProbeHost = typeof globalThis & {
  [RUNTIME_PROBE_GLOBAL_KEY]?: {
    version: number;
    bootstrap?: {
      state?: string;
      startedAtMs?: number | null;
      finishedAtMs?: number | null;
      failureMessage?: string | null;
    };
    loop?: {
      renderedFrameCount?: number;
      lastFrameId?: number | null;
      lastFrameAtMs?: number | null;
    };
  };
};

function probeHost(): ProbeHost {
  return globalThis as ProbeHost;
}

describe('runtime-probe', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    delete probeHost()[RUNTIME_PROBE_GLOBAL_KEY];
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    delete probeHost()[RUNTIME_PROBE_GLOBAL_KEY];
  });

  it('is a no-op when showPreview is absent', () => {
    markRuntimeBootstrapStarted(10);
    markRuntimeFrameAdvanced(1, 11);
    markRuntimeBootstrapSucceeded(12);
    markRuntimeBootstrapFailed('ignored', 13);

    expect(probeHost()[RUNTIME_PROBE_GLOBAL_KEY]).toBeUndefined();
  });

  it('publishes and reuses the canonical probe when showPreview=true', () => {
    window.history.replaceState({}, '', '/?showPreview=true');

    markRuntimeBootstrapStarted(10);
    const probe = probeHost()[RUNTIME_PROBE_GLOBAL_KEY];

    expect(probe).toMatchObject({
      version: 1,
      bootstrap: {
        state: 'starting',
        startedAtMs: 10,
        finishedAtMs: null,
        failureMessage: null,
      },
      loop: {
        renderedFrameCount: 0,
        lastFrameId: null,
        lastFrameAtMs: null,
      },
    });

    markRuntimeFrameAdvanced(7, 11);
    markRuntimeBootstrapSucceeded(12);

    expect(probeHost()[RUNTIME_PROBE_GLOBAL_KEY]).toBe(probe);
    expect(probeHost()[RUNTIME_PROBE_GLOBAL_KEY]).toMatchObject({
      bootstrap: {
        state: 'succeeded',
        startedAtMs: 10,
        finishedAtMs: 12,
        failureMessage: null,
      },
      loop: {
        renderedFrameCount: 1,
        lastFrameId: 7,
        lastFrameAtMs: 11,
      },
    });
  });

  it('accepts showPreview=1 and replaces stale probe versions', () => {
    window.history.replaceState({}, '', '/?showPreview=1');
    probeHost()[RUNTIME_PROBE_GLOBAL_KEY] = {
      version: 0,
      bootstrap: {
        state: 'failed',
        startedAtMs: 1,
        finishedAtMs: 2,
        failureMessage: 'stale',
      },
      loop: {
        renderedFrameCount: 99,
        lastFrameId: 99,
        lastFrameAtMs: 99,
      },
    };

    markRuntimeBootstrapStarted(20);
    markRuntimeBootstrapFailed('boom', 21);

    expect(probeHost()[RUNTIME_PROBE_GLOBAL_KEY]).toMatchObject({
      version: 1,
      bootstrap: {
        state: 'failed',
        startedAtMs: 20,
        finishedAtMs: 21,
        failureMessage: 'boom',
      },
      loop: {
        renderedFrameCount: 0,
        lastFrameId: null,
        lastFrameAtMs: null,
      },
    });
  });
});
