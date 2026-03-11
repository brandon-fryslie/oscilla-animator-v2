/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import { compileProgramWithNaga, compileWgslWithNaga } from '../compiler/naga-compile';
import type { CompileError } from '../compiler/types';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import { maybeBuildFluidGpuBundle } from './fluid-gpu-bundle';
import {
  DRAW_PREP_ENTRY_POINT,
  DRAW_PREP_PASS_ID,
  DRAW_PREP_WGSL_SOURCE,
} from './draw-prep-pass';
import type {
  CompiledGpuArtifactBundle,
  CompiledGpuPassArtifact,
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
} from './compile-worker-protocol';
import { stripKernelRegistry } from './compile-worker-serialization';

let drawPrepPassPromise: Promise<
  | { readonly kind: 'ok'; readonly pass: CompiledGpuPassArtifact }
  | { readonly kind: 'error'; readonly errors: readonly CompileError[] }
> | null = null;

async function compileDrawPrepPass(): Promise<
  | { readonly kind: 'ok'; readonly pass: CompiledGpuPassArtifact }
  | { readonly kind: 'error'; readonly errors: readonly CompileError[] }
> {
  if (!drawPrepPassPromise) {
    // [LAW:one-source-of-truth] Draw-prep compilation emits one canonical pass
    // artifact reused across compile requests in this worker lifetime.
    drawPrepPassPromise = compileWgslWithNaga(DRAW_PREP_WGSL_SOURCE).then((result) => {
      if (result.kind === 'error') {
        return {
          kind: 'error',
          errors: result.errors,
        } as const;
      }
      return {
        kind: 'ok',
        pass: {
          passId: DRAW_PREP_PASS_ID,
          stage: 'compute',
          entryPoint: DRAW_PREP_ENTRY_POINT,
          wgsl: result.wgsl,
        },
      } as const;
    });
  }
  return drawPrepPassPromise;
}

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

    const drawPrepPass = await compileDrawPrepPass();
    if (drawPrepPass.kind === 'error') {
      return {
        kind: 'error',
        errors: drawPrepPass.errors.map((error) => ({
          ...error,
          details: {
            ...(error.details ?? {}),
            preNagaWarnings: result.warnings,
          },
        })),
      };
    }
    compiledGpuBundle = {
      ...compiledGpuBundle,
      // [LAW:dataflow-not-control-flow] Pass install shape is deterministic:
      // simulation/fluid pass chain always followed by draw-prep.
      passes: [...compiledGpuBundle.passes, drawPrepPass.pass],
    };

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
