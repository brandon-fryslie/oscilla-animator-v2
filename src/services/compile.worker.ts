/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import {
  compileProgramWithNaga,
  validateGpuPassSignaturesAtCompileBoundary,
} from '../compiler/naga-compile';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import { maybeBuildFluidGpuBundle } from './fluid-gpu-bundle';
import type {
  CompiledGpuArtifactBundle,
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
} from './compile-worker-protocol';
import { stripKernelRegistry } from './compile-worker-serialization';

async function toBackendResult(
  frontendResult: ReturnType<typeof compileFrontend>,
  result: ReturnType<typeof compileFromFrontend>,
): Promise<CompileWorkerBackendResult> {
  if (result.kind === 'ok') {
    if (!result.program.generatedComputeProgram) {
      return {
        kind: 'error',
        errors: [
          {
            code: 'IRValidationFailed',
            message: 'Compiled program is missing generatedComputeProgram metadata',
            details: {
              preNagaWarnings: result.warnings,
            },
          },
        ],
      };
    }
    const fluidBundle = maybeBuildFluidGpuBundle(frontendResult.normalizedPatch, result.program);
    let compiledGpuBundle: CompiledGpuArtifactBundle;
    if (fluidBundle) {
      // [LAW:one-source-of-truth] Fluid-first compile emits one canonical
      // pass bundle artifact and bypasses legacy single-pass lowering output.
      compiledGpuBundle = fluidBundle;
    } else {
      // [LAW:single-enforcer] Non-fluid shader lowering is validated by one
      // Naga boundary before entering runtime worker transport.
      const nagaCompilation = await compileProgramWithNaga(result.program);
      if (nagaCompilation.kind === 'error') {
        return {
          kind: 'error',
          errors: nagaCompilation.errors.map((error) => ({
            ...error,
            details: {
              ...(error.details ?? {}),
              preNagaWarnings: result.warnings,
            },
          })),
        };
      }
      compiledGpuBundle = {
        schemaVersion: 1,
        passes: [{
          passId: 'simulation',
          stage: 'compute',
          entryPoint: 'compute_main',
          wgsl: nagaCompilation.wgsl,
        }],
      };
    }

    // [LAW:single-enforcer] Compile worker is the only runtime boundary that
    // admits GPU pass artifacts into worker transport after signature checks.
    const passSignatureValidation = validateGpuPassSignaturesAtCompileBoundary(compiledGpuBundle.passes);
    if (passSignatureValidation.kind === 'error') {
      return {
        kind: 'error',
        errors: passSignatureValidation.errors.map((error) => ({
          ...error,
          details: {
            ...(error.details ?? {}),
            preNagaWarnings: result.warnings,
          },
        })),
      };
    }

    const passSignatures = passSignatureValidation.signatures;
    const validatedCompiledGpuBundle: CompiledGpuArtifactBundle = {
      ...compiledGpuBundle,
      passSignatures,
    };

    const program = stripKernelRegistry(result.program);
    const programWithGpuManifest = {
      ...program,
      generatedGpuArtifactManifest: {
        schemaVersion: validatedCompiledGpuBundle.schemaVersion,
        passes: passSignatures.map((signature) => ({
          passId: signature.passId,
          stage: signature.stage,
          entryPoint: signature.entryPoint,
        })),
      },
    };
    return {
      kind: 'ok',
      program: programWithGpuManifest,
      compiledGpuBundle: validatedCompiledGpuBundle,
      warnings: result.warnings,
    };
  }
  return {
    kind: 'error',
    errors: result.errors,
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
