import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Patch } from '../../graph';
import type { CompileWorkerRunRequest, CompileWorkerRunResult } from '../CompileWorkerClient';
import { AsyncCompilerService } from '../AsyncCompilerService';

function makePatch(): Patch {
  return {
    blocks: new Map(),
    edges: [],
  };
}

function makeRequest(patchRevision: number): CompileWorkerRunRequest {
  return {
    patch: makePatch(),
    patchRevision,
  };
}

function makeResult(sourcePatchRevision: number): CompileWorkerRunResult {
  return {
    sourcePatchRevision,
    frontendResult: {} as any,
    backendResult: null,
    compiledGpuBundle: null,
    compiledComputeWgsl: null,
    compileDurationMs: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AsyncCompilerService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies trailing debounce and compiles only the latest queued request', async () => {
    vi.useFakeTimers();
    const compiled: number[] = [];
    const service = new AsyncCompilerService({
      debounceMs: 50,
      runCompile: async (request) => {
        compiled.push(request.patchRevision);
        return makeResult(request.patchRevision);
      },
    });

    service.scheduleCompile(makeRequest(1));
    service.scheduleCompile(makeRequest(2));
    expect(service.getState()).toBe('dirty');

    vi.advanceTimersByTime(49);
    expect(compiled).toEqual([]);

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(compiled).toEqual([2]);
    expect(service.getState()).toBe('ready');

    service.dispose();
  });

  it('drops stale compile artifacts once a newer schedule token exists', async () => {
    vi.useFakeTimers();

    const pending = new Map<number, ReturnType<typeof deferred<CompileWorkerRunResult>>>();
    const service = new AsyncCompilerService({
      debounceMs: 10,
      runCompile: (request) => {
        const gate = deferred<CompileWorkerRunResult>();
        pending.set(request.patchRevision, gate);
        return gate.promise;
      },
    });

    service.scheduleCompile(makeRequest(1));
    vi.advanceTimersByTime(10);
    await Promise.resolve();
    expect(service.getState()).toBe('compiling');

    service.scheduleCompile(makeRequest(2));
    vi.advanceTimersByTime(10);
    await Promise.resolve();
    expect(service.getState()).toBe('compiling');

    pending.get(1)!.resolve(makeResult(1));
    await Promise.resolve();
    expect(service.takeReadyArtifactsForSwap()).toBeNull();
    expect(service.getState()).toBe('compiling');

    pending.get(2)!.resolve(makeResult(2));
    await Promise.resolve();
    expect(service.getState()).toBe('ready');
    expect(service.takeReadyArtifactsForSwap()?.sourcePatchRevision).toBe(2);

    service.dispose();
  });

  it('transitions through linking and back to idle after swap completion', async () => {
    vi.useFakeTimers();
    const service = new AsyncCompilerService({
      debounceMs: 5,
      runCompile: async (request) => makeResult(request.patchRevision),
    });

    service.scheduleCompile(makeRequest(10));
    vi.advanceTimersByTime(5);
    await Promise.resolve();
    expect(service.getState()).toBe('ready');

    const next = service.takeReadyArtifactsForSwap();
    expect(next?.sourcePatchRevision).toBe(10);
    expect(service.getState()).toBe('linking');

    service.markSwapComplete();
    expect(service.getState()).toBe('idle');

    service.dispose();
  });

  it('preserves linking until swap completes when a new compile is scheduled mid-swap', async () => {
    vi.useFakeTimers();
    const pending = new Map<number, ReturnType<typeof deferred<CompileWorkerRunResult>>>();
    const service = new AsyncCompilerService({
      debounceMs: 10,
      runCompile: (request) => {
        const gate = deferred<CompileWorkerRunResult>();
        pending.set(request.patchRevision, gate);
        return gate.promise;
      },
    });

    service.scheduleCompile(makeRequest(1));
    vi.advanceTimersByTime(10);
    await Promise.resolve();
    expect(service.getState()).toBe('compiling');

    pending.get(1)!.resolve(makeResult(1));
    await Promise.resolve();
    expect(service.getState()).toBe('ready');
    service.takeReadyArtifactsForSwap();
    expect(service.getState()).toBe('linking');

    // Queue another compile while swap/linking is in progress.
    service.scheduleCompile(makeRequest(2));
    expect(service.getState()).toBe('linking');

    // Complete swap before debounce fires: service should advance to dirty.
    service.markSwapComplete();
    expect(service.getState()).toBe('dirty');

    vi.advanceTimersByTime(10);
    await Promise.resolve();
    expect(service.getState()).toBe('compiling');

    pending.get(2)!.resolve(makeResult(2));
    await Promise.resolve();
    expect(service.getState()).toBe('ready');

    service.dispose();
  });

  it('records compile failures on latest token and invokes failure callback once', async () => {
    vi.useFakeTimers();
    const onCompileFailure = vi.fn<(error: unknown) => void>();
    const service = new AsyncCompilerService({
      debounceMs: 5,
      runCompile: async () => {
        throw new Error('worker crashed');
      },
      onCompileFailure,
    });

    service.scheduleCompile(makeRequest(1));
    vi.advanceTimersByTime(5);
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getState()).toBe('error');
    expect(service.getLastErrorMessage()).toContain('worker crashed');
    expect(onCompileFailure).toHaveBeenCalledTimes(1);

    service.dispose();
  });
});
