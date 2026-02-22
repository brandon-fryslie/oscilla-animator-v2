import type { FrontendOptions } from '../compiler/frontend';
import type { CompileResult } from '../compiler/compile';
import type { CompiledProgramIR } from '../compiler/ir/program';
import { createDefaultRegistry } from '../runtime/kernels/default-registry';
import type { Patch } from '../graph';
import { serializePatch } from './PatchPersistence';
import { installSerializableTopologies } from '../shapes/registry';
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerCompiledMessage,
} from './compile-worker-protocol';

export class CompileSupersededError extends Error {
  constructor() {
    super('Compile request superseded by a newer graph revision');
  }
}

export interface CompileWorkerRunRequest {
  readonly patch: Patch;
  readonly patchRevision: number;
  readonly frontendOptions?: FrontendOptions;
}

export interface CompileWorkerRunResult {
  readonly sourcePatchRevision: number;
  readonly frontendResult: CompileWorkerCompiledMessage['frontendResult'];
  readonly backendResult: CompileResult | null;
  readonly compileDurationMs: number;
}

interface InFlightRequest {
  requestId: number;
  reject: (reason?: unknown) => void;
  resolve: (value: CompileWorkerRunResult) => void;
}

function sanitizeFrontendOptions(options: FrontendOptions | undefined): FrontendOptions | undefined {
  if (!options) return undefined;
  const sanitizedOverrides = options.diagnosticOverrides
    ? { ...options.diagnosticOverrides }
    : undefined;
  return {
    traceCardinalitySolver: options.traceCardinalitySolver === true,
    diagnosticOverrides: sanitizedOverrides,
  };
}

function reviveBackendResult(
  backend: CompileWorkerCompiledMessage['backendResult'],
): CompileResult | null {
  if (!backend) return null;
  if (backend.kind === 'error') {
    return { kind: 'error', errors: backend.errors };
  }

  // [LAW:one-source-of-truth] Program IR topology IDs are only meaningful with
  // the exact topology definitions from compile-time registration.
  installSerializableTopologies(backend.topologies);

  // [LAW:one-source-of-truth] Kernel handles are compile-time data; runtime registry
  // is reconstructed deterministically from the canonical default registry definition.
  const revivedProgram: CompiledProgramIR = {
    ...backend.program,
    kernelRegistry: createDefaultRegistry(),
  };

  return {
    kind: 'ok',
    program: revivedProgram,
    warnings: backend.warnings,
  };
}

export class CompileWorkerClient {
  private activeWorker: Worker | null = null;
  private nextRequestId = 0;
  private inFlight: InFlightRequest | null = null;
  private destroyed = false;

  private ensureWorker(): Worker {
    if (this.activeWorker) return this.activeWorker;

    const worker = new Worker(new URL('./compile.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.activeWorker = worker;

    worker.onmessage = (event: MessageEvent<CompileWorkerResponse>) => {
      const message = event.data;
      const inFlight = this.inFlight;
      if (!inFlight || !message || message.requestId !== inFlight.requestId) {
        // [LAW:dataflow-not-control-flow] Always receive worker messages; stale responses
        // are represented as data and ignored, not exceptional control flow.
        return;
      }

      this.inFlight = null;
      if (message.kind === 'workerError') {
        inFlight.reject(new Error(`Compile worker failed: ${message.message}`));
        return;
      }

      inFlight.resolve({
        sourcePatchRevision: message.patchRevision,
        frontendResult: message.frontendResult,
        backendResult: reviveBackendResult(message.backendResult),
        compileDurationMs: message.durationMs,
      });
    };

    worker.onerror = (event) => {
      const inFlight = this.inFlight;
      this.inFlight = null;
      if (inFlight) {
        inFlight.reject(new Error(`Compile worker crashed: ${event.message}`));
      }
      if (!this.destroyed) {
        // [LAW:single-enforcer] Worker lifecycle recovery is owned by this client.
        this.activeWorker = null;
      }
    };

    return worker;
  }

  async compile(request: CompileWorkerRunRequest): Promise<CompileWorkerRunResult> {
    if (this.inFlight) {
      this.inFlight.reject(new CompileSupersededError());
      this.inFlight = null;
    }

    const requestId = ++this.nextRequestId;
    const worker = this.ensureWorker();

    return await new Promise<CompileWorkerRunResult>((resolve, reject) => {
      this.inFlight = { requestId, resolve, reject };

      const payload: CompileWorkerRequest = {
        kind: 'compile',
        requestId,
        patchRevision: request.patchRevision,
        serializedPatch: serializePatch(request.patch, 0),
        // [LAW:single-enforcer] Worker boundary sanitizes options to plain data.
        frontendOptions: sanitizeFrontendOptions(request.frontendOptions),
      };
      try {
        worker.postMessage(payload);
      } catch (err) {
        if (this.inFlight?.requestId === requestId) {
          this.inFlight = null;
        }
        reject(
          new Error(
            `Compile worker request clone failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  dispose(): void {
    this.destroyed = true;
    if (this.inFlight) {
      this.inFlight.reject(new CompileSupersededError());
      this.inFlight = null;
    }
    this.activeWorker?.terminate();
    this.activeWorker = null;
  }
}
