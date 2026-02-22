/// <reference lib="webworker" />

import { compile } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import type { CompiledProgramIR } from '../compiler/ir/program';
import { EventHub } from '../events/EventHub';
import { deserializePatch } from './PatchPersistence';
import type { TopologyId } from '../shapes/types';
import { exportSerializableTopologies } from '../shapes/registry';
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
  CompileWorkerBackendResult,
  SerializableCompiledProgramIR,
} from './compile-worker-protocol';

function stripKernelRegistry(program: CompiledProgramIR): SerializableCompiledProgramIR {
  const { kernelRegistry: _drop, ...serializableProgram } = program;
  return serializableProgram;
}

function collectProgramTopologyIds(program: SerializableCompiledProgramIR): readonly TopologyId[] {
  const ids = new Set<TopologyId>();
  for (const expr of program.valueExprs.nodes as readonly any[]) {
    if (!expr || typeof expr !== 'object') continue;
    if (expr.kind === 'shapeRef' && typeof expr.topologyId === 'number') {
      ids.add(expr.topologyId as TopologyId);
      continue;
    }
    if (
      expr.kind === 'kernel' &&
      (expr.kernelKind === 'pathDerivative' || expr.kernelKind === 'pathSample') &&
      typeof expr.topologyId === 'number'
    ) {
      ids.add(expr.topologyId as TopologyId);
    }
  }
  return [...ids];
}

function toBackendResult(
  result: ReturnType<typeof compile>,
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
          compile(patch, {
            // [LAW:single-enforcer] Compiler event emission remains owned by CompileOrchestrator.
            // Worker compile uses an isolated no-listener hub to satisfy compile()'s contract.
            events: new EventHub(),
            precomputedFrontend: frontendResult,
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
