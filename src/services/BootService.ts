import { NagaService } from '../compiler/naga-bridge';
import { compile_ir, type ShimBootStage, type ShimCompilationResult } from '../compiler/wasm/oscilla_naga_shim';

export type BootState = 'initial' | 'fetching' | 'compiling' | 'ready' | 'error';

export interface BootSnapshot {
  readonly state: BootState;
  readonly error: string | null;
}

type BootListener = (snapshot: BootSnapshot) => void;

const STAGE_TO_STATE: Record<ShimBootStage, BootState> = {
  fetching: 'fetching',
  compiling: 'compiling',
  binding: 'compiling',
};

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * [LAW:single-enforcer] BootService owns the app-level WASM boot gate state
 * machine so UI gating does not diverge across callsites.
 */
export class BootService {
  private snapshot: BootSnapshot = {
    state: 'initial',
    error: null,
  };

  private startPromise: Promise<BootSnapshot> | null = null;
  private readonly listeners = new Set<BootListener>();

  getSnapshot(): BootSnapshot {
    return this.snapshot;
  }

  subscribe(listener: BootListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<BootSnapshot> {
    if (this.snapshot.state === 'ready') {
      return this.snapshot;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.runStart();
    const finalSnapshot = await this.startPromise;
    this.startPromise = null;
    return finalSnapshot;
  }

  private async runStart(): Promise<BootSnapshot> {
    this.setSnapshot({
      state: 'fetching',
      error: null,
    });

    try {
      await NagaService.boot({
        onStage: (stage) => {
          this.setSnapshot({
            state: STAGE_TO_STATE[stage],
            error: null,
          });
        },
      });
      this.runSmokeTest();
      this.setSnapshot({
        state: 'ready',
        error: null,
      });
      return this.snapshot;
    } catch (error) {
      this.setSnapshot({
        state: 'error',
        error: formatErrorMessage(error),
      });
      return this.snapshot;
    }
  }

  private runSmokeTest(): void {
    // [LAW:verifiable-goals] Boot readiness requires a deterministic compile
    // call proving wasm bindings are callable, not just loaded.
    const smokeResult = compile_ir({} as never, 1) as ShimCompilationResult;
    const isStructuredResult =
      typeof smokeResult === 'object' &&
      smokeResult !== null &&
      typeof smokeResult.is_valid === 'boolean' &&
      Array.isArray(smokeResult.errors);
    if (!isStructuredResult) {
      throw new Error('WASM integrity check failed: compile_ir returned malformed result');
    }
  }

  private setSnapshot(next: BootSnapshot): void {
    if (this.snapshot.state === next.state && this.snapshot.error === next.error) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

