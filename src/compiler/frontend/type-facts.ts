/**
 * TypeFacts — Current best knowledge of port types after solving.
 *
 * TypeFacts are computed from the solver output without mutating the graph.
 * They provide the obligation system with the information needed to decide
 * whether dependencies are satisfied.
 *
 * StrictTypedGraph is produced only when all ports are resolved and no
 * obligations remain open.
 *
 * // [LAW:one-source-of-truth] TypeFacts.ports is the single view of type knowledge per iteration.
 * // [LAW:dataflow-not-control-flow] Status is always present (ok/unknown/conflict), never absent.
 */

import type { CanonicalType } from '../../core/canonical-types';
import type { InferenceCanonicalType } from '../../core/inference-types';
import type { DraftGraph } from './draft-graph';

// =============================================================================
// PortKey for TypeFacts (blockId-based, not blockIndex-based)
// =============================================================================

/**
 * Port key format: `${blockId}:${portName}:${'in'|'out'}`
 *
 * Uses blockId (not blockIndex) because DraftGraph doesn't have dense indices.
 */
export type DraftPortKey = `${string}:${string}:${'in' | 'out'}`;

export function draftPortKey(blockId: string, portName: string, dir: 'in' | 'out'): DraftPortKey {
  return `${blockId}:${portName}:${dir}` as DraftPortKey;
}

// =============================================================================
// PortTypeHint
// =============================================================================

export interface PortTypeHint {
  /** Resolution status */
  readonly status: 'ok' | 'unknown' | 'conflict';
  /** Present when status is 'ok' — fully resolved canonical type */
  readonly canonical?: CanonicalType;
  /** Present when status is 'unknown' — partially resolved inference type */
  readonly inference?: InferenceCanonicalType;
  /** Diagnostic IDs for conflicts or issues */
  readonly diagIds: readonly string[];
}

// =============================================================================
// TypeFacts
// =============================================================================

export interface TypeFacts {
  readonly ports: ReadonlyMap<DraftPortKey, PortTypeHint>;
}

/** Empty TypeFacts (all ports unknown). */
export const EMPTY_TYPE_FACTS: TypeFacts = {
  ports: new Map(),
};

// =============================================================================
// StrictTypedGraph
// =============================================================================

/**
 * StrictTypedGraph — fully resolved graph ready for backend compilation.
 *
 * Produced only when:
 * - Every port in the realized graph has status 'ok'
 * - No obligations are open
 * - No solver conflicts
 */
export interface StrictTypedGraph {
  readonly graph: DraftGraph;
  readonly portTypes: ReadonlyMap<DraftPortKey, CanonicalType>;
  readonly diagnostics: readonly unknown[];
}

// =============================================================================
// Helpers
// =============================================================================

/** Look up a port's type hint from TypeFacts. */
export function getPortHint(facts: TypeFacts, blockId: string, port: string, dir: 'in' | 'out'): PortTypeHint {
  const key = draftPortKey(blockId, port, dir);
  return facts.ports.get(key) ?? { status: 'unknown', diagIds: [] };
}

/** Check if a port is fully resolved (status === 'ok'). */
export function isPortResolved(facts: TypeFacts, blockId: string, port: string, dir: 'in' | 'out'): boolean {
  return getPortHint(facts, blockId, port, dir).status === 'ok';
}
