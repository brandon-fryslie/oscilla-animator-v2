import { describe, expect, it } from 'vitest';
import { compileFromFrontend } from '../../compiler/compile';
import { buildCompiledRuntimeInstallContract } from '../../compiler/backend/compiled-runtime-install-contract';
import { compileFrontend } from '../../compiler/frontend';
import { hclDemos } from '../../demo';
import { EventHub } from '../../events/EventHub';
import { deserializePatchFromHCL } from '../../patch-dsl';
import { stripKernelRegistry } from '../compile-worker-serialization';

const REPRESENTATIVE_DEMOS = [
  'simple.hcl',
  'perspective-camera.hcl',
  'expression-field-ops.hcl',
  'feedback-accumulator.hcl',
  'path-field-demo.hcl',
  'library-kitchen-sink.hcl',
  'mouse-spiral.hcl',
  'rect-mosaic.hcl',
] as const;

function selectRepresentativeDemos(allFiles: readonly string[]): readonly string[] {
  const selected = REPRESENTATIVE_DEMOS.filter((name) => allFiles.includes(name));
  if (selected.length > 0) return selected;
  return allFiles.slice(0, Math.min(8, allFiles.length));
}

describe('compile worker payload clone safety', () => {
  it('frontend and backend payloads are structured-clone safe for representative demos', () => {
    const failures: string[] = [];
    const demoFiles = selectRepresentativeDemos(hclDemos.map((demo) => demo.filename));

    for (const filename of demoFiles) {
      const hcl = hclDemos.find((demo) => demo.filename === filename)?.hcl;
      if (!hcl) {
        failures.push(`${filename}: demo not found`);
        continue;
      }
      const parsed = deserializePatchFromHCL(hcl);
      if (!parsed) {
        failures.push(`${filename}: patch parse failed`);
        continue;
      }

      const frontendResult = compileFrontend(parsed.patch);
      try {
        structuredClone(frontendResult);
      } catch (err) {
        failures.push(
          `${filename}: frontendResult clone failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const backendResult = frontendResult.backendReady
        ? compileFromFrontend(frontendResult, {
            events: new EventHub(),
          })
        : null;

      if (backendResult?.kind === 'ok') {
        const serializableProgram = stripKernelRegistry(backendResult.program);
        const runtimeInstall = buildCompiledRuntimeInstallContract(backendResult.program);
        const workerPayload = {
          kind: 'compiled' as const,
          requestId: 1,
          patchRevision: 1,
          durationMs: 1,
          frontendResult,
          backendResult: {
            kind: 'ok' as const,
            program: serializableProgram,
            compiledGpuBundle: {
              schemaVersion: 1 as const,
              passes: [
                {
                  passId: 'simulation',
                  stage: 'compute' as const,
                  entryPoint: 'compute_main',
                  wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
                },
              ],
              passSignatures: [
                {
                  passId: 'simulation',
                  stage: 'compute' as const,
                  entryPoint: 'compute_main',
                },
              ],
              runtimeInstall,
            },
            warnings: backendResult.warnings,
          },
        };

        try {
          structuredClone(workerPayload);
        } catch (err) {
          failures.push(
            `${filename}: worker payload clone failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // [LAW:one-source-of-truth] Full demo compile coverage is enforced by hcl-demos.test.ts.
    // This suite owns clone-safety behavior on a representative payload matrix.
    expect(failures).toEqual([]);
  });
});
