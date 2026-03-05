/// <reference lib="webworker" />

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
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

const NON_FLUID_PASSTHROUGH_WGSL = `
struct RuntimeUniforms {
  dummy: u32,
};

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> uniforms: RuntimeUniforms;

@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane < arrayLength(&arena_out)) {
    arena_out[lane] = arena_in[lane];
  }
  if (lane < arrayLength(&state_out)) {
    state_out[lane] = state_in[lane];
  }
}
`;

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
      // [LAW:one-source-of-truth] exception: non-fluid programs currently use one
      // canonical passthrough simulation kernel while full opcode-complete Naga
      // lowering is brought to parity for Type 1 rendering in the Rust path.
      compiledGpuBundle = {
        schemaVersion: 1,
        passes: [{
          passId: 'simulation',
          stage: 'compute',
          entryPoint: 'compute_main',
          wgsl: NON_FLUID_PASSTHROUGH_WGSL,
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
