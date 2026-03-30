/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
} from './compile-worker-protocol';
import { stripKernelRegistry } from './compile-worker-serialization';
import type { CompileError } from '../compiler/types';
import { buildCompiledRuntimeInstallContract } from '../compiler/backend/compiled-runtime-install-contract';

function toBackendError(errors: readonly CompileError[]): CompileWorkerBackendResult {
  return {
    kind: 'error',
    errors,
  };
}

// Naga WGSL generation removed — WGSL is now generated Rust-side via install_pipeline.
// The backend still produces CompiledProgramIR for the runtime install contract.
// GPU pass bundles are no longer generated JS-side.
async function toBackendResult(
  result: ReturnType<typeof compileFromFrontend>,
): Promise<CompileWorkerBackendResult> {
  if (result.kind !== 'ok') {
    return toBackendError(result.errors);
  }

  let runtimeInstall;
  try {
    runtimeInstall = buildCompiledRuntimeInstallContract(result.program);
  } catch (err) {
    return toBackendError([{
      code: 'IRValidationFailed',
      message: `Compiler emitted invalid runtime install contract: ${err instanceof Error ? err.message : String(err)}`,
    }]);
  }

  const program = stripKernelRegistry(result.program);
  return {
    kind: 'ok',
    program,
    compiledGpuBundle: null,
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
