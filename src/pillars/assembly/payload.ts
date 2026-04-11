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
