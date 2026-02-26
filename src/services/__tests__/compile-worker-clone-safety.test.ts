import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile';
import { compileFrontend } from '../../compiler/frontend';
import { EventHub } from '../../events/EventHub';
import { deserializePatchFromHCL } from '../../patch-dsl';
import { exportSerializableTopologies } from '../../shapes/registry';
import { collectProgramTopologyIds, stripKernelRegistry } from '../compile-worker-serialization';

function listDemoFiles(): readonly string[] {
  const demoDir = join(process.cwd(), 'src', 'demo', 'hcl');
  return readdirSync(demoDir)
    .filter((name) => name.endsWith('.hcl'))
    .sort((a, b) => a.localeCompare(b));
}

const REPRESENTATIVE_DEMOS = [
  'simple.hcl',
  'perspective-camera.hcl',
  'expression-field-ops.hcl',
  'feedback-accumulator.hcl',
  'path-field-demo.hcl',
  'library-kitchen-sink.hcl',
  'mouse-reactive.hcl',
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
    const demoFiles = selectRepresentativeDemos(listDemoFiles());

    for (const filename of demoFiles) {
      const fullPath = join(process.cwd(), 'src', 'demo', 'hcl', filename);
      const hcl = readFileSync(fullPath, 'utf8');
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
        ? compile(parsed.patch, {
            events: new EventHub(),
            precomputedFrontend: frontendResult,
          })
        : null;

      if (backendResult?.kind === 'ok') {
        const serializableProgram = stripKernelRegistry(backendResult.program);
        const topologies = exportSerializableTopologies(
          collectProgramTopologyIds(serializableProgram),
        );
        const workerPayload = {
          kind: 'compiled' as const,
          requestId: 1,
          patchRevision: 1,
          durationMs: 1,
          frontendResult,
          backendResult: {
            kind: 'ok' as const,
            program: serializableProgram,
            topologies,
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
