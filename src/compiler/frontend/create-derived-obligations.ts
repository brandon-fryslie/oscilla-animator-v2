/**
 * Create Derived Obligations — generates obligations during fixpoint iteration.
 *
 * Called inside the fixpoint loop after Solve (NOT in buildDraftGraph).
 * Creates NeedsAdapterObligation for edges where both endpoints have
 * resolved types (status:'ok') AND the types differ structurally.
 *
 * Also creates NeedsPayloadAnchor obligations for unresolved polymorphic chains.
 *
 * // [LAW:single-enforcer] This is the only place that creates adapter and payload anchor obligations.
 * // [LAW:dataflow-not-control-flow] Always runs; emptiness is data (returns []).
 */

import type { DraftGraph, DraftPortRef } from './draft-graph';
import type { Obligation, ObligationId } from './obligations';
import type { TypeFacts, PortTypeHint } from './type-facts';
import { getPortHint, draftPortKey } from './type-facts';
import { isAssignable } from '../../blocks/adapter-spec';
import { isPayloadVar, isUnitVar } from '../../core/inference-types';
import { isAxisVar } from '../../core/canonical-types';

// =============================================================================
// Public API
// =============================================================================

/**
 * Create derived obligations for edges that need adapters or payload anchors.
 *
 * First pass (adapters):
 * - For each edge with role 'userWire' or 'defaultWire':
 *   - Skip edges with elaboration origin (prevents elaboration-on-elaboration loops)
 *   - If both endpoints have status:'ok' AND types differ: create NeedsAdapterObligation
 *   - If either endpoint is not ok: do nothing (wait for more solving)
 *
 * Second pass (payload anchors):
 * - For each unresolved polymorphic component (group of ports with same payload var):
 *   - Find eligible edges (both endpoints canonicalizable except payload)
 *   - Pick the first edge deterministically
 *   - Create one NeedsPayloadAnchor obligation
 *   - Only one anchor per iteration (advance one component at a time)
 *
 * Returns new obligations only — caller merges into graph.
 */
export function createDerivedObligations(
  g: DraftGraph,
  facts: TypeFacts,
): readonly Obligation[] {
  const obligations: Obligation[] = [];

  // ===== First pass: adapter obligations =====
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

    // If source is assignable to destination, no adapter needed
    // (looser than typesEqual: contract dropping is OK)
    if (isAssignable(fromHint.canonical, toHint.canonical)) continue;

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

  // ===== Second pass: payload anchor obligations =====
  // One anchor per iteration — advance one component at a time.
  const anchorObligation = derivePayloadAnchorObligation(g, facts);
  if (anchorObligation) {
    obligations.push(anchorObligation);
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

/**
 * Check if a port has an unresolved payload var.
 *
 * Requirements:
 * - status: 'unknown' with inference (not 'ok' — that's already fully canonical)
 * - Payload is a var (that's what we're anchoring)
 */
function hasUnresolvedPayload(hint: PortTypeHint): boolean {
  if (hint.status === 'ok') return false; // Already fully resolved
  if (hint.status !== 'unknown' || !hint.inference) return false;
  return isPayloadVar(hint.inference.payload);
}

/**
 * Derive a single payload anchor obligation for the first unresolved polymorphic component.
 *
 * Algorithm:
 * 1. Build unresolved payload components: group ports by their payload var ID.
 *    A component is "unresolved" if all ports in the component have payload vars.
 * 2. For each unresolved component:
 *    - Collect edges touching that component where both endpoints satisfy
 *      isCanonicalizableExceptPayload and no existing Adapter_PayloadAnchorFloat
 *      is already on the edge.
 * 3. Sort eligible edges by deterministic semantic key.
 * 4. Pick the first edge from the first component (components sorted by smallest member port key).
 * 5. Emit one obligation.
 *
 * Returns at most one obligation per call (for determinism and gradual resolution).
 */
function derivePayloadAnchorObligation(
  g: DraftGraph,
  facts: TypeFacts,
): Obligation | null {
  // Step 1: Build unresolved payload components
  const payloadGroups = new Map<string, string[]>(); // payload var ID → port keys

  for (const [portKey, hint] of facts.ports) {
    if (hint.status !== 'unknown' || !hint.inference) continue;
    if (!isPayloadVar(hint.inference.payload)) continue;
    const varId = hint.inference.payload.id;
    const ports = payloadGroups.get(varId) ?? [];
    ports.push(portKey);
    payloadGroups.set(varId, ports);
  }

  // Step 2: For each component, collect eligible edges
  const componentEdges = new Map<string, Array<{ edge: typeof g.edges[0]; key: string }>>();

  for (const [varId, portKeys] of payloadGroups) {
    const eligible: Array<{ edge: typeof g.edges[0]; key: string }> = [];

    for (const edge of g.edges) {
      // Skip non-user/non-default edges
      if (edge.role !== 'userWire' && edge.role !== 'defaultWire') continue;

      // Skip elaborated edges
      if (typeof edge.origin === 'object' && edge.origin.kind === 'elaboration') continue;

      // Skip edges that already have a payload anchor
      const fromBlock = g.blocks.find((b) => b.id === edge.from.blockId);
      const toBlock = g.blocks.find((b) => b.id === edge.to.blockId);
      if (fromBlock?.type === 'Adapter_PayloadAnchorFloat' || toBlock?.type === 'Adapter_PayloadAnchorFloat') {
        continue;
      }

      // Check if both endpoints are in this component and satisfy the constraint
      const fromKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
      const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');

      if (!portKeys.includes(fromKey) && !portKeys.includes(toKey)) continue;

      const fromHint = getPortHint(facts, edge.from.blockId, edge.from.port, 'out');
      const toHint = getPortHint(facts, edge.to.blockId, edge.to.port, 'in');

      if (!hasUnresolvedPayload(fromHint) || !hasUnresolvedPayload(toHint)) {
        continue;
      }

      // Build deterministic key
      const key = `${edge.from.blockId}:${edge.from.port}:out->${edge.to.blockId}:${edge.to.port}:in`;
      eligible.push({ edge, key });
    }

    if (eligible.length > 0) {
      componentEdges.set(varId, eligible);
    }
  }

  // Step 3: Sort components by smallest member port key (for determinism)
  const sortedComponents = Array.from(componentEdges.entries()).sort((a, b) => {
    const minA = Math.min(...payloadGroups.get(a[0])!.map((k) => k.charCodeAt(0)));
    const minB = Math.min(...payloadGroups.get(b[0])!.map((k) => k.charCodeAt(0)));
    return minA - minB;
  });

  if (sortedComponents.length === 0) return null;

  // Step 4: Pick the first edge from the first component
  const [varId, edges] = sortedComponents[0];
  edges.sort((a, b) => a.key.localeCompare(b.key));
  const { edge, key } = edges[0];

  // Step 5: Emit one obligation
  return {
    id: `needsPayloadAnchor:${key}` as ObligationId,
    kind: 'needsPayloadAnchor',
    anchor: { edgeId: edge.id },
    status: { kind: 'open' },
    deps: [
      { kind: 'portHasUnresolvedPayload', port: edge.from },
      { kind: 'portHasUnresolvedPayload', port: edge.to },
    ],
    policy: { name: 'payloadAnchor.v1', version: 1 },
    debug: {
      createdBy: 'createDerivedObligations',
      note: `payload anchor: ${key}`,
    },
  };
}
