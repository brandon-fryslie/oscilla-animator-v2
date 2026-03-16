/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import { compileProgramWithNaga } from '../compiler/naga-compile';
import { primeNagaShimWasmBytes } from '../compiler/wasm/oscilla_naga_shim';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import { maybeBuildFluidGpuBundle } from './fluid-gpu-bundle';
import type {
  CompiledGpuArtifactBundle,
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
} from './compile-worker-protocol';
import { validateCompiledGpuPassBundle } from './compiled-gpu-pass-validation';
import { stripKernelRegistry } from './compile-worker-serialization';
import type { CompileError } from '../compiler/types';
import type { GeneratedGpuArtifactManifestIR } from '../compiler/ir/program';

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

function buildCanonicalSimulationPassBundle(wgsl: string): CompiledGpuArtifactBundle {
  return {
    schemaVersion: 1,
    passes: [{
      passId: 'simulation',
      stage: 'compute',
      entryPoint: 'compute_main',
      wgsl,
    }],
  };
}

function withGpuManifest(
  program: ReturnType<typeof stripKernelRegistry>,
  manifest: GeneratedGpuArtifactManifestIR,
): ReturnType<typeof stripKernelRegistry> {
  return {
    ...program,
    generatedGpuArtifactManifest: manifest,
  };
}

async function compileNonFluidBundle(
  program: Parameters<typeof compileProgramWithNaga>[0],
): Promise<
  | { readonly kind: 'ok'; readonly bundle: CompiledGpuArtifactBundle }
  | { readonly kind: 'error'; readonly errors: readonly CompileError[] }
> {
  // [LAW:single-enforcer] Non-fluid shader lowering is validated by one
  // Naga boundary before entering runtime worker transport.
  const nagaCompilation = await compileProgramWithNaga(program);
  if (nagaCompilation.kind === 'error') {
    return { kind: 'error', errors: nagaCompilation.errors };
  }
  return {
    kind: 'ok',
    bundle: buildCanonicalSimulationPassBundle(nagaCompilation.wgsl),
  };
}

async function toBackendResult(
  frontendResult: ReturnType<typeof compileFrontend>,
  result: ReturnType<typeof compileFromFrontend>,
): Promise<CompileWorkerBackendResult> {
  if (result.kind !== 'ok') {
    return toBackendError(result.errors);
  }
  if (!result.program.generatedComputeProgram) {
    return toBackendError(attachPreNagaWarnings(
      [{
        code: 'IRValidationFailed',
        message: 'Compiled program is missing generatedComputeProgram metadata',
      }],
      result.warnings,
    ));
  }
  const fluidBundle = maybeBuildFluidGpuBundle(frontendResult.normalizedPatch, result.program);
  const nonFluidBundleResult = fluidBundle
    ? null
    : await compileNonFluidBundle(result.program);

  if (nonFluidBundleResult?.kind === 'error') {
    return toBackendError(attachPreNagaWarnings(nonFluidBundleResult.errors, result.warnings));
  }
  const compiledGpuBundle = fluidBundle ?? nonFluidBundleResult?.bundle;
  if (!compiledGpuBundle) {
    return toBackendError(attachPreNagaWarnings(
      [{
        code: 'IRValidationFailed',
        message: 'Compiler emitted invalid non-fluid GPU artifact bundle',
      }],
      result.warnings,
    ));
  }

  const passValidation = validateCompiledGpuPassBundle(compiledGpuBundle);
  if (passValidation.kind === 'error') {
    return toBackendError(attachPreNagaWarnings(passValidation.errors, result.warnings));
  }

  const program = stripKernelRegistry(result.program);
  const programWithGpuManifest = withGpuManifest(program, passValidation.manifest);
  return {
    kind: 'ok',
    program: programWithGpuManifest,
    compiledGpuBundle: passValidation.bundle,
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
        frontendResult,
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
