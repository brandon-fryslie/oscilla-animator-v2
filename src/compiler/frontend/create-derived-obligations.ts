/**
 * Create Derived Obligations — generates obligations during fixpoint iteration.
 *
 * Called inside the fixpoint loop after Solve (NOT in buildDraftGraph).
 * Creates NeedsAdapterObligation for edges where both endpoints have
 * resolved types (status:'ok') AND the types differ structurally.
 *
 * // [LAW:single-enforcer] This is the only place that creates adapter obligations.
 * // [LAW:dataflow-not-control-flow] Always runs; emptiness is data (returns []).
 */

import type { DraftGraph, DraftPortRef } from './draft-graph';
import type { Obligation, ObligationId } from './obligations';
import type { TypeFacts } from './type-facts';
import { getPortHint } from './type-facts';
import { typesEqual } from '../../core/canonical-types';

// =============================================================================
// Public API
// =============================================================================

/**
 * Create derived obligations for edges that need adapters.
 *
 * For each edge with role 'userWire' or 'defaultWire':
 * - Skip edges with elaboration origin (prevents elaboration-on-elaboration loops)
 * - If both endpoints have status:'ok' AND types differ: create NeedsAdapterObligation
 * - If either endpoint is not ok: do nothing (wait for more solving)
 *
 * Returns new obligations only — caller merges into graph.
 */
export function createDerivedObligations(
  g: DraftGraph,
  facts: TypeFacts,
): readonly Obligation[] {
  const obligations: Obligation[] = [];

  for (const edge of g.edges) {
    // Only check user wires and default wires — not already-elaborated edges
    if (edge.role !== 'userWire' && edge.role !== 'defaultWire') continue;

    // Skip elaborated edges to prevent loops
    if (typeof edge.origin === 'object' && edge.origin.kind === 'elaboration') continue;

    // Check both endpoints
    const fromHint = getPortHint(facts, edge.from.blockId, edge.from.port, 'out');
    const toHint = getPortHint(facts, edge.to.blockId, edge.to.port, 'in');

    // Both must be fully resolved
    if (fromHint.status !== 'ok' || toHint.status !== 'ok') continue;
    if (!fromHint.canonical || !toHint.canonical) continue;

    // If types are structurally equal, no adapter needed
    if (typesEqual(fromHint.canonical, toHint.canonical)) continue;

    // Types differ — create NeedsAdapterObligation
    // The adapter policy will determine if an adapter exists or if it should be blocked
    const oblId = needsAdapterObligationId(edge.from, edge.to);

    obligations.push({
      id: oblId,
      kind: 'needsAdapter',
      anchor: {
        edgeId: edge.id,
        blockId: edge.from.blockId,
      },
      status: { kind: 'open' },
      deps: [
        { kind: 'portCanonicalizable', port: edge.from },
        { kind: 'portCanonicalizable', port: edge.to },
      ],
      policy: { name: 'adapters.v1', version: 1 },
      debug: {
        createdBy: 'createDerivedObligations',
        note: `${edge.from.blockId}:${edge.from.port} → ${edge.to.blockId}:${edge.to.port}`,
      },
    });
  }

  return obligations;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate deterministic obligation ID for an adapter need.
 * Keyed by semantic endpoints (not edge ID) for stability under rewrites.
 */
function needsAdapterObligationId(from: DraftPortRef, to: DraftPortRef): ObligationId {
  return `needsAdapter:${from.blockId}:${from.port}->${to.blockId}:${to.port}` as ObligationId;
}
