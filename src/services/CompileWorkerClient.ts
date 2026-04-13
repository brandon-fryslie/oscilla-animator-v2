import type { FrontendOptions } from '../compiler/frontend';
import type { CompileResult } from '../compiler/compile';
import type { CompiledProgramIR } from '../compiler/ir/program';
import { createDefaultRegistry } from '../runtime/kernels/default-registry';
import type { Patch } from '../graph';
import { serializePatch } from './PatchPersistence';
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerCompiledMessage,
  WorkerFrontendOptions,
  WorkerDiagnosticSeverityOverride,
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
  request: CompileWorkerRunRequest;
  reject: (reason?: unknown) => void;
  resolve: (value: CompileWorkerRunResult) => void;
  superseded: boolean;
}

const ALLOWED_SEVERITY_OVERRIDES = new Set<WorkerDiagnosticSeverityOverride>([
  'error',
  'warn',
  'info',
  'ignore',
]);

function sanitizeDiagnosticOverrides(
  overrides: FrontendOptions['diagnosticOverrides'],
): Readonly<Record<string, WorkerDiagnosticSeverityOverride>> | undefined {
  if (!overrides || typeof overrides !== 'object') return undefined;

  const plain: Record<string, WorkerDiagnosticSeverityOverride> = {};
  // [LAW:single-enforcer] Worker boundary is the one place that normalizes
  // frontend options to a clone-safe plain object payload.
  for (const [code, raw] of Object.entries(overrides as Record<string, unknown>)) {
    if (typeof code !== 'string' || code.length === 0) continue;
    if (typeof raw !== 'string' || !ALLOWED_SEVERITY_OVERRIDES.has(raw as WorkerDiagnosticSeverityOverride)) continue;
    plain[code] = raw as WorkerDiagnosticSeverityOverride;
  }

  return Object.keys(plain).length > 0 ? plain : undefined;
}

function sanitizeFrontendOptions(options: FrontendOptions | undefined): WorkerFrontendOptions | undefined {
  if (!options) return undefined;
  const sanitizedOverrides = sanitizeDiagnosticOverrides(options.diagnosticOverrides);
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
  private queued: InFlightRequest | null = null;
  private destroyed = false;

  private buildPayload(inFlight: InFlightRequest): CompileWorkerRequest {
    return {
      kind: 'compile',
      requestId: inFlight.requestId,
      patchRevision: inFlight.request.patchRevision,
      serializedPatch: serializePatch(inFlight.request.patch, 0),
      // [LAW:single-enforcer] Worker boundary sanitizes options to plain data.
      frontendOptions: sanitizeFrontendOptions(inFlight.request.frontendOptions),
    };
  }

  private startRequest(inFlight: InFlightRequest): void {
    const worker = this.ensureWorker();
    this.inFlight = inFlight;
    void this.dispatchRequest(worker, inFlight);
  }

  private async dispatchRequest(worker: Worker, inFlight: InFlightRequest): Promise<void> {
    try {
      const payload = this.buildPayload(inFlight);
      worker.postMessage(payload);
    } catch (err) {
      if (this.inFlight?.requestId === inFlight.requestId) {
        this.inFlight = null;
      }
      inFlight.reject(
        new Error(
          `Compile worker request clone failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      this.drainQueued();
    }
  }

  private supersedeInFlight(): void {
    if (!this.inFlight || this.inFlight.superseded) return;
    this.inFlight.superseded = true;
    this.inFlight.reject(new CompileSupersededError());
  }

  private supersedeQueued(): void {
    if (!this.queued) return;
    this.queued.reject(new CompileSupersededError());
    this.queued = null;
  }

  private drainQueued(): void {
    if (this.destroyed || this.inFlight || !this.queued) return;
    const next = this.queued;
    this.queued = null;
    this.startRequest(next);
  }

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
        if (!inFlight.superseded) {
          inFlight.reject(new Error(`Compile worker failed: ${message.message}`));
        }
        this.drainQueued();
        return;
      }

      if (!inFlight.superseded) {
        inFlight.resolve({
          sourcePatchRevision: message.patchRevision,
          frontendResult: message.frontendResult,
          backendResult: reviveBackendResult(message.backendResult),
          compileDurationMs: message.durationMs,
        });
      }
      this.drainQueued();
    };

    worker.onerror = (event) => {
      const inFlight = this.inFlight;
      this.inFlight = null;
      if (inFlight && !inFlight.superseded) {
        inFlight.reject(new Error(`Compile worker crashed: ${event.message}`));
      }
      if (!this.destroyed) {
        // [LAW:single-enforcer] Worker lifecycle recovery is owned by this client.
        this.activeWorker = null;
        this.drainQueued();
      }
    };

    return worker;
  }

  async compile(request: CompileWorkerRunRequest): Promise<CompileWorkerRunResult> {
    const requestId = ++this.nextRequestId;

    return await new Promise<CompileWorkerRunResult>((resolve, reject) => {
      const nextRequest: InFlightRequest = {
        requestId,
        request,
        resolve,
        reject,
        superseded: false,
      };

      // [LAW:dataflow-not-control-flow] Every compile request executes the same
      // queue pipeline; variability lives in queue/in-flight data, not branches.
      this.supersedeInFlight();
      this.supersedeQueued();
      this.queued = nextRequest;
      this.drainQueued();
    });
  }

  dispose(): void {
    this.destroyed = true;
    this.supersedeInFlight();
    this.inFlight = null;
    this.supersedeQueued();
    this.activeWorker?.terminate();
    this.activeWorker = null;
  }
}
