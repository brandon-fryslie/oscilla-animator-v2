/**
 * C1 Phase 5: Roster Assembly
 *
 * Sorts passes by type precedence and auto-infers dependencies.
 * Order: System_CameraUpdate -> Compute -> System_DrawPrep -> Render
 */

import type { PipelineInstallPayload, MemoryManifest, RosterEntry } from '../../render/rust/boundary-contract';
import { inferComputeDeps, inferDrawCallDeps } from '../../render/gpu-ir/deps';

const PASS_ORDER: Record<string, number> = {
  System_CameraUpdate: 0,
  Compute: 1,
  System_DrawPrep: 2,
  Render: 3,
};

export function assembleRoster(
  manifest: MemoryManifest,
  passes: readonly RosterEntry[],
): PipelineInstallPayload {
  // Sort by type precedence, stable within same type
  const sorted = [...passes].sort((a, b) => {
    const orderA = PASS_ORDER[a.type] ?? 99;
    const orderB = PASS_ORDER[b.type] ?? 99;
    return orderA - orderB;
  });

  // Auto-infer dependencies for compute and render passes
  const withDeps = sorted.map((pass): RosterEntry => {
    if (pass.type === 'Compute') {
      const deps = inferComputeDeps(pass.ast, manifest);
      return { ...pass, dependencies: deps };
    }
    if (pass.type === 'Render') {
      // Infer dependencies for each draw call
      const drawCalls = pass.drawCalls.map(dc => {
        const deps = inferDrawCallDeps(
          dc.vertexAst, dc.fragmentAst, manifest, dc.dependencies.cameraRef,
        );
        return { ...dc, dependencies: deps };
      });
      return { ...pass, drawCalls };
    }
    return pass;
  });

  return { manifest, roster: withDeps };
}
