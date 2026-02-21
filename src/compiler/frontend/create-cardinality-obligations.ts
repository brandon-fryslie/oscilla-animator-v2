/**
 * Create Cardinality Adapter Obligations from Cardinality Conflicts
 *
 * Given PromoteToManyClampOneConflict and ClampManyConflict errors from the
 * cardinality solver, identifies boundary edges (one→many) and creates
 * at most ONE needsCardinalityAdapter obligation per fixpoint iteration.
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
// Internal: Candidate type
// =============================================================================

interface BoundaryCandidate {
  edgeId: string;
  semanticKey: string;
  fromBlockId: string;
  fromPort: string;
  toBlockId: string;
  toPort: string;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create cardinality adapter obligations from cardinality conflicts.
 *
 * Handles two conflict types:
 *
 * 1. PromoteToManyClampOneConflict: Edge equality merges both endpoints into
 *    the same UF group. The boundary edge connects two ports that are BOTH
 *    in clampOneMembers, where the `to` port is ALSO in the conflict's
 *    zipPorts. Inserting Broadcast breaks the edge equality.
 *
 * 2. ClampManyConflict: Edge equality merges a clampOne port with a forceMany
 *    port into the same UF group. The boundary edge connects a port from the
 *    clampOne side (from) to a port from the forceMany side (to), or vice versa.
 *    Inserting Broadcast breaks the edge equality, allowing each side to
 *    resolve independently.
 *
 * Algorithm:
 * 1. Collect boundary edge candidates from both conflict types
 * 2. Deduplicate by semantic key across all conflicts
 * 3. Sort by semantic key, pick exactly ONE (monotone)
 *
 * Returns 0 or 1 obligations.
 */
export function createCardinalityAdapterObligations(
  g: DraftGraph,
  conflicts: readonly CardinalitySolveError[],
): readonly Obligation[] {
  // [LAW:dataflow-not-control-flow] Always compute; empty arrays flow through.
  const candidatesByKey = new Map<string, BoundaryCandidate>();

  // --- PromoteToMany clampOne conflict candidates ---
  const promoteConflicts = conflicts.filter(
    (e): e is Extract<CardinalitySolveError, { kind: 'PromoteToManyClampOneConflict' }> =>
      e.kind === 'PromoteToManyClampOneConflict',
  );

  for (const conflict of promoteConflicts) {
    const clampOneSet = new Set(conflict.clampOneMembers);
    const zipPortSet = new Set(conflict.zipPorts);

    for (const edge of g.edges) {
      if (isCardinalityAdapterEdge(edge)) continue;

      const fromKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
      const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');

      // Boundary: from is in clampOne, to is in clampOne ∩ zipPorts
      if (clampOneSet.has(fromKey) && clampOneSet.has(toKey) && zipPortSet.has(toKey)) {
        addCandidate(candidatesByKey, edge);
      }
    }
  }

  // --- ClampManyConflict candidates ---
  // For ClampManyConflict, both clampOne and forceMany evidence exist in the same
  // UF group. The boundary edge is any edge connecting a clampOne port to any other
  // port in the group — breaking it with Broadcast separates the groups.
  // Strategy: find edges where from is directly constrained as clampOne, and to is
  // any other member of the conflict (in the same UF group but not itself clampOne).
  // Fallback: if clampOne ports don't directly have edges to other members,
  // find any edge whose both endpoints are in the conflict's port set.
  const cmConflicts = conflicts.filter(
    (e): e is Extract<CardinalitySolveError, { kind: 'ClampManyConflict' }> =>
      e.kind === 'ClampManyConflict',
  );

  for (const conflict of cmConflicts) {
    const allPorts = new Set(conflict.ports);
    const clampOneSet = new Set(conflict.clampOneMembers);

    for (const edge of g.edges) {
      if (isCardinalityAdapterEdge(edge)) continue;

      const fromKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
      const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');

      // Both endpoints must be in the conflict group (same UF group)
      if (!allPorts.has(fromKey) || !allPorts.has(toKey)) continue;

      // Prefer edges where from is clampOne and to is not (one→many boundary)
      // Also accept edges where to is clampOne and from is not (many→one boundary)
      // Either direction works — Broadcast insertion breaks the edge equality.
      const fromIsClampOne = clampOneSet.has(fromKey);
      const toIsClampOne = clampOneSet.has(toKey);
      if (fromIsClampOne !== toIsClampOne) {
        addCandidate(candidatesByKey, edge);
      } else if (fromIsClampOne && toIsClampOne) {
        // Both are clampOne — edge between two clampOne ports, still a valid
        // boundary if they're in a group with forceMany evidence
        addCandidate(candidatesByKey, edge);
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

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Check if edge was inserted by the cardinality adapter policy.
 * Only skip THESE edges to prevent infinite loops — other elaboration edges
 * (e.g., from default-source policy) are valid boundary candidates.
 */
function isCardinalityAdapterEdge(edge: { origin: unknown }): boolean {
  if (typeof edge.origin !== 'object' || (edge.origin as any)?.kind !== 'elaboration') return false;
  const oblId = (edge.origin as any)?.obligationId as string | undefined;
  return oblId !== undefined && oblId.startsWith('needsCardinalityAdapter:');
}

function addCandidate(
  map: Map<string, BoundaryCandidate>,
  edge: { id: string; from: { blockId: string; port: string }; to: { blockId: string; port: string } },
): void {
  const semanticKey = `${edge.from.blockId}:${edge.from.port}:out->${edge.to.blockId}:${edge.to.port}:in`;
  if (!map.has(semanticKey)) {
    map.set(semanticKey, {
      edgeId: edge.id,
      semanticKey,
      fromBlockId: edge.from.blockId,
      fromPort: edge.from.port,
      toBlockId: edge.to.blockId,
      toPort: edge.to.port,
    });
  }
}
