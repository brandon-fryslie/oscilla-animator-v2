/**
 * Create Cardinality Adapter Obligations from ZipBroadcast Conflicts
 *
 * Given ZipBroadcastClampOneConflict errors from the cardinality solver,
 * identifies boundary edges (signal→field) and creates at most ONE
 * needsCardinalityAdapter obligation per fixpoint iteration.
 *
 * Monotone strategy: one obligation per iteration keeps the fixpoint
 * predictable and prevents oscillation.
 *
 * // [LAW:dataflow-not-control-flow] Always computes candidates; selection is by sorting data, not branching control.
 * // [LAW:single-enforcer] This is the only place that creates cardinality adapter obligations.
 */

import type { DraftGraph } from './draft-graph';
import type { Obligation, ObligationId } from './obligations';
import type { CardinalitySolveError } from './cardinality/solve';
import { draftPortKey } from './type-facts';

// =============================================================================
// Public API
// =============================================================================

/**
 * Create cardinality adapter obligations from ZipBroadcast conflicts.
 *
 * Boundary edge identification:
 * Edge equality merges both endpoints into the same UF group. When the
 * clampOne side merges with a zipBroadcast member, both end up in
 * clampOneMembers. The boundary edge connects two ports that are BOTH
 * in clampOneMembers, where the `to` port is ALSO in the conflict's
 * zipPorts. Inserting Broadcast breaks the edge equality, allowing the
 * `to` port to resolve independently in a subsequent iteration.
 *
 * Algorithm:
 * 1. For each ZipBroadcastClampOneConflict:
 *    - S = conflict.clampOneMembers (UF group forced to one)
 *    - Z = conflict.zipPorts (ports in the conflicting zipBroadcast)
 *    - Scan edges: from port in S, to port in S ∩ Z
 *    - Skip edges with elaboration origin (prevents loops)
 * 2. Deduplicate by semantic key across all conflicts
 * 3. Sort by semantic key, pick exactly ONE (monotone)
 *
 * Returns 0 or 1 obligations.
 */
export function createCardinalityAdapterObligations(
  g: DraftGraph,
  conflicts: readonly CardinalitySolveError[],
): readonly Obligation[] {
  // Filter to ZipBroadcastClampOneConflict only
  const zbConflicts = conflicts.filter(
    (e): e is Extract<CardinalitySolveError, { kind: 'ZipBroadcastClampOneConflict' }> =>
      e.kind === 'ZipBroadcastClampOneConflict',
  );

  // [LAW:dataflow-not-control-flow] Always compute; empty arrays flow through.
  // Collect boundary edge candidates across all conflicts
  const candidatesByKey = new Map<string, { edgeId: string; semanticKey: string; fromBlockId: string; fromPort: string; toBlockId: string; toPort: string }>();

  for (const conflict of zbConflicts) {
    const clampOneSet = new Set(conflict.clampOneMembers);
    const zipPortSet = new Set(conflict.zipPorts);

    for (const edge of g.edges) {
      // Skip elaboration edges (prevents infinite loops)
      if (typeof edge.origin === 'object' && edge.origin.kind === 'elaboration') continue;

      const fromKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
      const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');

      // Boundary: from is in clampOne, to is in clampOne ∩ zipPorts
      // The to port was pulled into the clampOne group via edge equality,
      // but also participates in the conflicting zipBroadcast.
      // Inserting Broadcast breaks the edge equality, freeing the to port.
      if (clampOneSet.has(fromKey) && clampOneSet.has(toKey) && zipPortSet.has(toKey)) {
        const semanticKey = `${edge.from.blockId}:${edge.from.port}:out->${edge.to.blockId}:${edge.to.port}:in`;
        if (!candidatesByKey.has(semanticKey)) {
          candidatesByKey.set(semanticKey, {
            edgeId: edge.id,
            semanticKey,
            fromBlockId: edge.from.blockId,
            fromPort: edge.from.port,
            toBlockId: edge.to.blockId,
            toPort: edge.to.port,
          });
        }
      }
    }
  }

  const candidates = [...candidatesByKey.values()];
  if (candidates.length === 0) return [];

  // Sort by semantic key for determinism; tie-break on edgeId
  candidates.sort((a, b) => {
    const cmp = a.semanticKey.localeCompare(b.semanticKey);
    return cmp !== 0 ? cmp : a.edgeId.localeCompare(b.edgeId);
  });

  // Pick exactly ONE — monotone, one per iteration
  const pick = candidates[0];
  const oblId = `needsCardinalityAdapter:${pick.semanticKey}` as ObligationId;

  return [{
    id: oblId,
    kind: 'needsCardinalityAdapter',
    anchor: {
      edgeId: pick.edgeId,
      blockId: pick.fromBlockId,
    },
    status: { kind: 'open' },
    deps: [],  // No type deps — cardinality conflicts are structural
    policy: { name: 'cardinalityAdapters.v1', version: 1 },
    debug: {
      createdBy: 'createCardinalityAdapterObligations',
      note: `boundary edge: ${pick.semanticKey}`,
    },
  }];
}
