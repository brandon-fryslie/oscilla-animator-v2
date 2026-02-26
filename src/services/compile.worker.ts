/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import { exportSerializableTopologies } from '../shapes/registry';
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
} from './compile-worker-protocol';
import { collectProgramTopologyIds, stripKernelRegistry } from './compile-worker-serialization';

function toBackendResult(
  result: ReturnType<typeof compileFromFrontend>,
): CompileWorkerBackendResult {
  if (result.kind === 'ok') {
    const program = stripKernelRegistry(result.program);
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

self.onmessage = (event: MessageEvent<CompileWorkerRequest>) => {
  const message = event.data;
  if (!message || message.kind !== 'compile') {
    return;
  }

  const startMs = performance.now();
  const { serializedPatch, frontendOptions, patchRevision, requestId } = message;

  try {
    const decoded = deserializePatch(serializedPatch);
    if (!decoded) {
      const response: CompileWorkerResponse = {
        kind: 'workerError',
        requestId,
        patchRevision,
        durationMs: Math.max(0, performance.now() - startMs),
        message: 'Compile worker received invalid serialized patch payload',
      };
      self.postMessage(response);
      return;
    }

    const patch = decoded.patch;
    const frontendResult = compileFrontend(patch, frontendOptions);
    const backendResult = frontendResult.backendReady
      ? toBackendResult(
          compileFromFrontend(frontendResult, {
            // [LAW:single-enforcer] Compiler event emission remains owned by CompileOrchestrator.
            // Worker compile uses an isolated no-listener hub for backend compile context.
            events: new EventHub(),
          }),
        )
      : null;

    const response: CompileWorkerResponse = {
      kind: 'compiled',
      requestId,
      patchRevision,
      durationMs: Math.max(0, performance.now() - startMs),
      frontendResult,
      backendResult,
    };
    self.postMessage(response);
  } catch (err) {
    const response: CompileWorkerResponse = {
      kind: 'workerError',
      requestId,
      patchRevision,
      durationMs: Math.max(0, performance.now() - startMs),
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
