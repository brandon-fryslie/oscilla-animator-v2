import type { NormalizedGraph } from '../frontend/normalized-graph';
import { walkAndLower } from './walker';
import { mergeManifestContributions } from './manifest-merge';
import type { LoweredPasses } from './lowered-passes';

export type { LoweredPasses } from './lowered-passes';

export function lowerNormalizedGraph(graph: NormalizedGraph): LoweredPasses {
  const { manifest, errors: mergeErrors } = mergeManifestContributions(graph.nodes);
  const { passes, errors: walkErrors } = walkAndLower(graph, manifest);
  return {
    manifest,
    rosterEntries: passes,
    errors: [...mergeErrors, ...walkErrors],
  };
}
