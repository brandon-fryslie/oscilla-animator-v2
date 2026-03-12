import type { FrontendResult } from '../compiler/frontend';
import type { CompileError } from '../compiler/types';
import type { CompiledProgramIR } from '../compiler/ir/program';

export type SerializableCompiledProgramIR = Omit<CompiledProgramIR, 'kernelRegistry'>;

export interface CompiledGpuPassArtifact {
  readonly passId: string;
  readonly stage: 'compute';
  readonly entryPoint: string;
  readonly wgsl: string;
}

export interface CompiledGpuPassSignature {
  readonly passId: string;
  readonly stage: 'compute';
  readonly entryPoint: string;
}

export interface CompiledGpuArtifactBundle {
  readonly schemaVersion: 1;
  readonly passes: readonly CompiledGpuPassArtifact[];
  // [LAW:single-enforcer] Pass signature semantics are enforced once at
  // compile boundary and transported as typed metadata once validated.
  readonly passSignatures?: readonly CompiledGpuPassSignature[];
}

export type CompileWorkerBackendResult =
  | {
      readonly kind: 'ok';
      readonly program: SerializableCompiledProgramIR;
      readonly compiledGpuBundle: CompiledGpuArtifactBundle;
      readonly warnings: readonly CompileError[];
    }
  | {
      readonly kind: 'error';
      readonly errors: readonly CompileError[];
    };

export type WorkerDiagnosticSeverityOverride = 'error' | 'warn' | 'info' | 'ignore';

/**
 * Clone-safe frontend options payload for worker transport.
 * [LAW:single-enforcer] Worker boundary owns clone-safe shape constraints.
 */
export interface WorkerFrontendOptions {
  readonly traceCardinalitySolver?: boolean;
  readonly diagnosticOverrides?: Readonly<Record<string, WorkerDiagnosticSeverityOverride>>;
}

export interface CompileWorkerRequest {
  readonly kind: 'compile';
  readonly requestId: number;
  readonly patchRevision: number;
  /**
   * Serialized patch payload.
   * [LAW:single-enforcer] Worker message boundary is the single clone-safety boundary.
   */
  readonly serializedPatch: string;
  readonly frontendOptions?: WorkerFrontendOptions;
}

export interface CompileWorkerCompiledMessage {
  readonly kind: 'compiled';
  readonly requestId: number;
  readonly patchRevision: number;
  readonly durationMs: number;
  readonly frontendResult: FrontendResult;
  readonly backendResult: CompileWorkerBackendResult | null;
}

export interface CompileWorkerErrorMessage {
  readonly kind: 'workerError';
  readonly requestId: number;
  readonly patchRevision: number;
  readonly durationMs: number;
  readonly message: string;
}

export type CompileWorkerResponse =
  | CompileWorkerCompiledMessage
  | CompileWorkerErrorMessage;
