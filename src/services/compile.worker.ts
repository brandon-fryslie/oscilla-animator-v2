/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import { compileProgramWithNaga } from '../compiler/naga-compile';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import { exportSerializableTopologies } from '../shapes/registry';
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
} from './compile-worker-protocol';
import { collectProgramTopologyIds, stripKernelRegistry } from './compile-worker-serialization';

async function toBackendResult(
  result: ReturnType<typeof compileFromFrontend>,
): Promise<CompileWorkerBackendResult> {
  if (result.kind === 'ok') {
    if (!result.program.generatedComputeProgram) {
      return {
        kind: 'error',
        errors: [
          {
            code: 'IRValidationFailed',
            message: 'Compiled program is missing generatedComputeProgram',
            details: {
              preNagaWarnings: result.warnings,
            },
          },
        ],
      };
    }

    const nagaOutcome = await compileProgramWithNaga(result.program);
    if (nagaOutcome.kind === 'error') {
      const errorsWithWarningContext = nagaOutcome.errors.map((error, index) => {
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

    const programWithValidatedWgsl = {
      ...result.program,
      generatedComputeProgram: {
        ...result.program.generatedComputeProgram,
        // [LAW:one-source-of-truth] Worker WGSL payload comes from one validated
        // Naga emission path, not parallel string emitters.
        wgsl: nagaOutcome.wgsl,
      },
    };

    const program = stripKernelRegistry(programWithValidatedWgsl);
    const topologyIds = collectProgramTopologyIds(program);
    return {
      kind: 'ok',
      program,
      topologies: exportSerializableTopologies(topologyIds),
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
