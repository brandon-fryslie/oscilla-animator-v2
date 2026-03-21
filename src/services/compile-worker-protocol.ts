import type { FrontendResult } from '../compiler/frontend';
import type { CompiledRuntimeInstallContract } from '../compiler/backend/compiled-runtime-install-contract';
import type { CompileError } from '../compiler/types';
import type { CompiledProgramIR, GpuReadyCompiledProgramIR } from '../compiler/ir/program';
import type { GpuPassStage } from '../types/gpu-pass-stage';

export type SerializableCompiledProgramIR = Omit<CompiledProgramIR, 'kernelRegistry'>;
export type SerializableGpuReadyCompiledProgramIR = Omit<GpuReadyCompiledProgramIR, 'kernelRegistry'>;
export type {
  CompiledDrawPrepInstallArtifact,
  CompiledShapeBankInstallArtifact,
  CompiledRuntimeInstallContract,
} from '../compiler/backend/compiled-runtime-install-contract';

export interface CompiledGpuPassArtifact {
  readonly passId: string;
  readonly stage: GpuPassStage;
  readonly entryPoint: string;
  readonly wgsl: string;
}

export interface CompiledGpuPassSignature {
  readonly passId: string;
  readonly stage: GpuPassStage;
  readonly entryPoint: string;
}

export interface CompiledGpuPassBundle {
  readonly schemaVersion: 1;
  readonly passes: readonly CompiledGpuPassArtifact[];
  // [LAW:single-enforcer] Pass signature semantics are enforced once at
  // compile boundary and transported as typed metadata once validated.
  readonly passSignatures?: readonly CompiledGpuPassSignature[];
}

export interface CompiledGpuArtifactBundle extends CompiledGpuPassBundle {
  // [LAW:one-source-of-truth] Compile worker owns the canonical static install
  // contract. Runtime consumes this payload directly instead of rebuilding it.
  readonly runtimeInstall: CompiledRuntimeInstallContract;
}

export function toCompiledGpuPassSignature(
  pass: Pick<CompiledGpuPassArtifact, 'passId' | 'stage' | 'entryPoint'>,
): CompiledGpuPassSignature {
  return {
    passId: pass.passId,
    stage: pass.stage,
    entryPoint: pass.entryPoint,
  };
}

export type CompileWorkerBackendResult =
  | {
      readonly kind: 'ok';
      readonly program: SerializableGpuReadyCompiledProgramIR;
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
  readonly nagaShimWasmBytes: ArrayBuffer;
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
