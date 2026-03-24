/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import { compileProgramWithNaga } from '../compiler/naga-compile';
import { primeNagaShimWasmBytes } from '../compiler/wasm/oscilla_naga_shim';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import type {
  CompiledGpuPassBundle,
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
  SerializableCompiledProgramIR,
  SerializableGpuReadyCompiledProgramIR,
} from './compile-worker-protocol';
import { validateCompiledGpuPassBundle } from './compiled-gpu-pass-validation';
import { stripKernelRegistry } from './compile-worker-serialization';
import type { CompileError } from '../compiler/types';
import type {
  GeneratedGpuArtifactManifestIR,
} from '../compiler/ir/program';
import { buildCompiledRuntimeInstallContract } from '../compiler/backend/compiled-runtime-install-contract';

function attachPreNagaWarnings(
  errors: readonly CompileError[],
  preNagaWarnings: readonly CompileError[],
): readonly CompileError[] {
  return errors.map((error) => ({
    ...error,
    details: {
      ...(error.details ?? {}),
      preNagaWarnings,
    },
  }));
}

function toBackendError(errors: readonly CompileError[]): CompileWorkerBackendResult {
  return {
    kind: 'error',
    errors,
  };
}

function buildCanonicalSimulationPassBundle(
  wgsl: string,
  memoryManifest: SerializableCompiledProgramIR['memoryManifest'],
): CompiledGpuPassBundle {
  return {
    schemaVersion: 1,
    passes: [{
      passId: 'simulation',
      stage: 'compute',
      entryPoint: 'compute_main',
      wgsl,
      // [LAW:one-source-of-truth] Rust renderer MMU resolution consumes the
      // same compile-owned memory manifest used by Naga lowering.
      memoryManifest,
    }],
  };
}

function withGpuManifest(
  program: SerializableCompiledProgramIR,
  manifest: GeneratedGpuArtifactManifestIR,
): SerializableGpuReadyCompiledProgramIR {
  return {
    ...program,
    generatedGpuArtifactManifest: manifest,
  };
}

async function toBackendResult(
  result: ReturnType<typeof compileFromFrontend>,
): Promise<CompileWorkerBackendResult> {
  if (result.kind !== 'ok') {
    return toBackendError(result.errors);
  }
  // [LAW:single-enforcer] Shader lowering is validated by one Naga boundary
  // before entering runtime worker transport.
  const nagaCompilation = await compileProgramWithNaga(result.program);
  if (nagaCompilation.kind === 'error') {
    return toBackendError(attachPreNagaWarnings(nagaCompilation.errors, result.warnings));
  }
  const compiledGpuBundle = buildCanonicalSimulationPassBundle(
    nagaCompilation.wgsl,
    result.program.memoryManifest,
  );

  const passValidation = validateCompiledGpuPassBundle(compiledGpuBundle);
  if (passValidation.kind === 'error') {
    return toBackendError(attachPreNagaWarnings(passValidation.errors, result.warnings));
  }

  let runtimeInstall;
  try {
    runtimeInstall = buildCompiledRuntimeInstallContract(result.program);
  } catch (err) {
    return toBackendError(attachPreNagaWarnings(
      [{
        code: 'IRValidationFailed',
        message: `Compiler emitted invalid runtime install contract: ${err instanceof Error ? err.message : String(err)}`,
      }],
      result.warnings,
    ));
  }

  const program = stripKernelRegistry(result.program);
  const programWithGpuManifest = withGpuManifest(program, passValidation.manifest);
  return {
    kind: 'ok',
    program: programWithGpuManifest,
    compiledGpuBundle: {
      ...passValidation.bundle,
      runtimeInstall,
    },
    warnings: result.warnings,
  };
}

async function handleCompileMessage(
  message: CompileWorkerRequest,
  startMs: number,
): Promise<CompileWorkerResponse> {
  const { serializedPatch, frontendOptions, patchRevision, requestId } = message;

  const decoded = deserializePatch(serializedPatch);
  if (!decoded) {
    return {
      kind: 'workerError',
      requestId,
      patchRevision,
      durationMs: Math.max(0, performance.now() - startMs),
      message: 'Compile worker received invalid serialized patch payload',
    };
  }

  const patch = decoded.patch;
  primeNagaShimWasmBytes(message.nagaShimWasmBytes);
  const frontendResult = compileFrontend(patch, frontendOptions);
  const backendResult = frontendResult.backendReady
    ? await toBackendResult(
        compileFromFrontend(frontendResult, {
          // [LAW:single-enforcer] Compiler event emission remains owned by CompileOrchestrator.
          // Worker compile uses an isolated no-listener hub for backend compile context.
          events: new EventHub(),
        }),
      )
    : null;

  return {
    kind: 'compiled',
    requestId,
    patchRevision,
    durationMs: Math.max(0, performance.now() - startMs),
    frontendResult,
    backendResult,
  };
}

self.onmessage = (event: MessageEvent<CompileWorkerRequest>) => {
  const message = event.data;
  if (!message || message.kind !== 'compile') {
    return;
  }
  const startMs = performance.now();

  void handleCompileMessage(message, startMs)
    .then((response) => {
      self.postMessage(response);
    })
    .catch((err) => {
      const response: CompileWorkerResponse = {
        kind: 'workerError',
        requestId: message.requestId,
        patchRevision: message.patchRevision,
        durationMs: Math.max(0, performance.now() - startMs),
        message: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    });
};
