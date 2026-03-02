import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureRuntimeProbe,
  markRuntimeBootstrapFailed,
  markRuntimeBootstrapStarted,
  markRuntimeBootstrapSucceeded,
  markRuntimeFrameAdvanced,
  RUNTIME_PROBE_GLOBAL_KEY,
  shouldEnableRuntimeProbe,
} from './runtime-probe';

function clearProbe(): void {
  delete (globalThis as typeof globalThis & Record<string, unknown>)[RUNTIME_PROBE_GLOBAL_KEY];
}

describe('runtime probe', () => {
  afterEach(() => {
    clearProbe();
    window.history.replaceState({}, '', '/');
  });

  it('enables only for showPreview=true or showPreview=1', () => {
    window.history.replaceState({}, '', '/?showPreview=true');
    expect(shouldEnableRuntimeProbe()).toBe(true);

    window.history.replaceState({}, '', '/?showPreview=1');
    expect(shouldEnableRuntimeProbe()).toBe(true);

    window.history.replaceState({}, '', '/?showPreview=false');
    expect(shouldEnableRuntimeProbe()).toBe(false);

    window.history.replaceState({}, '', '/');
    expect(shouldEnableRuntimeProbe()).toBe(false);
  });

  it('returns null when probe is disabled', () => {
    window.history.replaceState({}, '', '/');
    expect(ensureRuntimeProbe()).toBeNull();
  });

  it('reuses version 1 probe instances and replaces incompatible versions', () => {
    window.history.replaceState({}, '', '/?showPreview=true');

    const first = ensureRuntimeProbe();
    const second = ensureRuntimeProbe();
    expect(first).toBeTruthy();
    expect(second).toBe(first);

    (globalThis as typeof globalThis & Record<string, unknown>)[RUNTIME_PROBE_GLOBAL_KEY] = {
      version: 2,
    };

    const replaced = ensureRuntimeProbe();
    expect(replaced).toBeTruthy();
    expect(replaced).not.toBe(first);
    expect(replaced).toMatchObject({
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
    });
  });

  it('marks bootstrap start and clears prior completion state', () => {
    window.history.replaceState({}, '', '/?showPreview=true');

    markRuntimeBootstrapFailed('prior failure', 5);
    markRuntimeBootstrapStarted(10);

    expect(ensureRuntimeProbe()).toMatchObject({
      bootstrap: {
        state: 'starting',
        startedAtMs: 10,
        finishedAtMs: null,
        failureMessage: null,
      },
    });
  });

  it('marks bootstrap success and clears failure message', () => {
    window.history.replaceState({}, '', '/?showPreview=true');

    markRuntimeBootstrapFailed('compile failed', 12);
    markRuntimeBootstrapSucceeded(24);

    expect(ensureRuntimeProbe()).toMatchObject({
      bootstrap: {
        state: 'succeeded',
        startedAtMs: null,
        finishedAtMs: 24,
        failureMessage: null,
      },
    });
  });

  it('marks bootstrap failure with message and timestamp', () => {
    window.history.replaceState({}, '', '/?showPreview=true');

    markRuntimeBootstrapStarted(8);
    markRuntimeBootstrapFailed('runtime crashed', 16);

    expect(ensureRuntimeProbe()).toMatchObject({
      bootstrap: {
        state: 'failed',
        startedAtMs: 8,
        finishedAtMs: 16,
        failureMessage: 'runtime crashed',
      },
    });
  });

  it('records frame advancement count, frame id, and timestamp', () => {
    window.history.replaceState({}, '', '/?showPreview=true');

    markRuntimeFrameAdvanced(-1, 11);
    markRuntimeFrameAdvanced(42, 22);

    expect(ensureRuntimeProbe()).toMatchObject({
      loop: {
        renderedFrameCount: 2,
        lastFrameId: 42,
        lastFrameAtMs: 22,
      },
    });
  });
});
