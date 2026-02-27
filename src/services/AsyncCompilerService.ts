import type { CompileWorkerRunRequest, CompileWorkerRunResult } from './CompileWorkerClient';
import { CompileSupersededError } from './CompileWorkerClient';
import type { PrecomputedCompileArtifacts } from './CompileOrchestrator';
import type { AsyncCompilerState } from '../types/async-compiler-state';

export type { AsyncCompilerState } from '../types/async-compiler-state';

export interface AsyncCompilerServiceDeps {
  readonly runCompile: (request: CompileWorkerRunRequest) => Promise<CompileWorkerRunResult>;
  readonly onCompileFailure?: (error: unknown) => void;
  readonly debounceMs?: number;
}

type CompilerStateListener = (state: AsyncCompilerState) => void;

interface ScheduledCompile {
  readonly token: number;
  readonly request: CompileWorkerRunRequest;
}

const DEFAULT_DEBOUNCE_MS = 50;

/**
 * Async compiler coordinator for live graph edits.
 *
 * [LAW:single-enforcer] This service is the single owner of compile debounce,
 * stale-result rejection, and compile lifecycle state transitions.
 */
export class AsyncCompilerService {
  private readonly runCompile: AsyncCompilerServiceDeps['runCompile'];
  private readonly onCompileFailure: ((error: unknown) => void) | undefined;
  private readonly debounceMs: number;
  private readonly listeners = new Set<CompilerStateListener>();

  private disposed = false;
  private state: AsyncCompilerState = 'idle';
  private lastErrorMessage: string | null = null;
  private scheduleToken = 0;
  private scheduled: ScheduledCompile | null = null;
  private inFlightToken: number | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readyArtifacts: PrecomputedCompileArtifacts | null = null;

  constructor(deps: AsyncCompilerServiceDeps) {
    this.runCompile = deps.runCompile;
    this.onCompileFailure = deps.onCompileFailure;
    this.debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  getState(): AsyncCompilerState {
    return this.state;
  }

  getLastErrorMessage(): string | null {
    return this.lastErrorMessage;
  }

  subscribe(listener: CompilerStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  scheduleCompile(request: CompileWorkerRunRequest): void {
    if (this.disposed) return;

    const token = ++this.scheduleToken;
    this.scheduled = { token, request };
    // [LAW:one-source-of-truth] The newest scheduled compile token is canonical.
    // Older ready artifacts are stale once a new compile is requested.
    this.readyArtifacts = null;
    this.lastErrorMessage = null;
    // [LAW:dataflow-not-control-flow] Preserve linking state while a swap is in
    // progress; queued compile intent is represented by scheduled/debounce data.
    if (this.state !== 'linking') {
      this.setState('dirty');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.launchScheduledCompile();
    }, this.debounceMs);
  }

  takeReadyArtifactsForSwap(): PrecomputedCompileArtifacts | null {
    if (this.disposed || this.state !== 'ready' || !this.readyArtifacts) {
      return null;
    }
    const artifacts = this.readyArtifacts;
    this.readyArtifacts = null;
    this.setState('linking');
    return artifacts;
  }

  markSwapComplete(): void {
    if (this.disposed) return;
    if (this.state !== 'linking') return;
    const hasCompileInFlight = this.inFlightToken !== null;
    const hasPendingDebounce = this.scheduled !== null || this.debounceTimer !== null;
    // [LAW:dataflow-not-control-flow] Swap completion transitions depend on queue
    // and in-flight data, not ad-hoc callsite branching.
    if (hasCompileInFlight) {
      this.setState('compiling');
      return;
    }
    this.setState(hasPendingDebounce ? 'dirty' : 'idle');
  }

  markSwapFailed(error: unknown): void {
    if (this.disposed) return;
    this.readyArtifacts = null;
    this.lastErrorMessage = error instanceof Error ? error.message : String(error);
    this.setState('error');
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.listeners.clear();
    this.scheduled = null;
    this.inFlightToken = null;
    this.readyArtifacts = null;
  }

  private launchScheduledCompile(): void {
    const next = this.scheduled;
    if (!next || this.disposed) return;

    this.scheduled = null;
    const launchToken = next.token;
    this.inFlightToken = launchToken;
    this.setState('compiling');

    void this.runCompile(next.request)
      .then((result) => {
        this.handleCompileSuccess(launchToken, result);
      })
      .catch((error) => {
        this.handleCompileFailure(launchToken, error);
      });
  }

  private handleCompileSuccess(token: number, result: CompileWorkerRunResult): void {
    if (this.disposed) return;
    if (this.inFlightToken === token) {
      this.inFlightToken = null;
    }
    if (token !== this.scheduleToken) return;

    this.readyArtifacts = {
      sourcePatchRevision: result.sourcePatchRevision,
      frontendResult: result.frontendResult,
      backendResult: result.backendResult,
      compileDurationMs: result.compileDurationMs,
    };
    this.lastErrorMessage = null;
    this.setState('ready');
  }

  private handleCompileFailure(token: number, error: unknown): void {
    if (this.disposed) return;
    if (this.inFlightToken === token) {
      this.inFlightToken = null;
    }
    if (error instanceof CompileSupersededError) return;
    if (token !== this.scheduleToken) return;

    this.readyArtifacts = null;
    this.lastErrorMessage = error instanceof Error ? error.message : String(error);
    this.setState('error');
    this.onCompileFailure?.(error);
  }

  private setState(next: AsyncCompilerState): void {
    if (this.state === next) return;
    this.state = next;
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
