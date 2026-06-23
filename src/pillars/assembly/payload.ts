/**
 * src/pillars/assembly/payload.ts
 *
 * FROZEN LEGACY. Assembles the Rust-boundary `PipelineInstallPayload` — the
 * dead GPU-IR target (design-docs/three-migration-backend-canon.md §"Dead
 * Concepts"). New backend work targets `ScenePlan` via `compileScenePlan`
 * (src/pillars/scene), not this assembler. The two targets do not co-assemble
 * from one graph; see design-docs/three-migration-scene-plan.md §"The
 * Replacement". Kept only to keep the frozen Rust path operational during
 * migration — do not extend.
 */

import type { PipelineInstallPayload } from '../../render/rust/boundary-contract';
import type { LoweredPasses } from '../lowering/lowered-passes';

export function assemblePipelineInstallPayload(
  lowered: LoweredPasses,
): PipelineInstallPayload {
  return {
    manifest: lowered.manifest,
    roster: lowered.rosterEntries,
  };
}
