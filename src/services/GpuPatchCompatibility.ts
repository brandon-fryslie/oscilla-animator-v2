import type { Patch } from '../graph/Patch';
import { getAnyBlockDefinition } from '../blocks/registry';

export interface GpuPatchVerificationResult {
  readonly ok: boolean;
  readonly unverifiedBlockTypes: readonly string[];
  readonly unknownBlockTypes: readonly string[];
}

export function verifyGpuPatchCompatibility(patch: Patch): GpuPatchVerificationResult {
  const unverified = new Set<string>();
  const unknown = new Set<string>();

  for (const block of patch.blocks.values()) {
    const def = getAnyBlockDefinition(block.type);
    if (!def) {
      unknown.add(block.type);
      continue;
    }
    if (!def.gpuVerified) {
      unverified.add(block.type);
    }
  }

  const unknownBlockTypes = Array.from(unknown).sort((a, b) => a.localeCompare(b));
  const unverifiedBlockTypes = Array.from(unverified).sort((a, b) => a.localeCompare(b));
  return {
    ok: unknownBlockTypes.length === 0 && unverifiedBlockTypes.length === 0,
    unknownBlockTypes,
    unverifiedBlockTypes,
  };
}
