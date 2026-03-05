/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import { compileProgramWithNaga } from '../compiler/naga-compile';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import { maybeBuildFluidGpuBundle } from './fluid-gpu-bundle';
import type {
  CompiledGpuArtifactBundle,
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
} from './compile-worker-protocol';
import type { CompileError } from '../compiler/types';
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
      const nagaOutcome = await compileProgramWithNaga(result.program);
      if (nagaOutcome.kind === 'error') {
        const errorsWithWarningContext: CompileError[] = nagaOutcome.errors.map((error, index) => {
          if (index !== 0) return error;
          return {
            ...error,
            details: {
              ...(error.details ?? {}),
              preNagaWarnings: result.warnings,
            },
          };
        });
        return {
          kind: 'error',
          errors: errorsWithWarningContext,
        };
      }
      // [LAW:no-string-math] Compiler output remains structured IR; WGSL text stays
      // at the serializer boundary and is not persisted back into program IR.
      compiledGpuBundle = {
        schemaVersion: 1,
        passes: [{
          passId: 'simulation',
          stage: 'compute',
          entryPoint: 'compute_main',
          wgsl: nagaOutcome.wgsl,
        }],
      };
    }

    if (!compiledGpuBundle?.passes?.length) {
      return {
        kind: 'error',
        errors: [{
          code: 'IRValidationFailed',
          message: 'Compiler emitted an empty GPU artifact pass bundle',
        }],
      };
    }

    const program = stripKernelRegistry(result.program);
    const programWithGpuManifest = {
      ...program,
      generatedGpuArtifactManifest: {
        schemaVersion: compiledGpuBundle.schemaVersion,
        passes: compiledGpuBundle.passes.map((pass) => ({
          passId: pass.passId,
          stage: pass.stage,
          entryPoint: pass.entryPoint,
        })),
      },
    };
    return {
      kind: 'ok',
      program: programWithGpuManifest,
      compiledGpuBundle,
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
