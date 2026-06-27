/**
 * src/pillars/types/solve/typed-graph.ts
 *
 * The core data model for the fixpoint type solver: the in-flight mutable
 * graph, obligation lifecycle, elaboration plans, and the result types the
 * solver produces. Everything is immutable-style (readonly arrays, spreading
 * to produce new objects) so iteration N never mutates iteration N-1's state.
 * [LAW:effects-at-boundaries]
 *
 * Three lifetimes in this file:
 *   1. `MutableGraph` — grows one plan-application at a time (actually
 *      replaced rather than mutated: each `applyElaborationPlan` returns a
 *      new graph with bumped revision).
 *   2. `Obligation` — created deterministically, deduped by ID, discharged
 *      when a plan fires. Never deleted; discharged obligations stay in the
 *      list so the driver can explain what happened.
 *   3. `StrictTypedGraph` — produced once at convergence if no open
 *      obligations remain and every port has a concrete type.
 * [LAW:no-ambient-temporal-coupling]
 */

import type {
  ZBlockContract,
  ZCanonicalType,
  ZInferenceCanonicalType,
} from '../schemas';

// ---------------------------------------------------------------------------
// Branded identifiers
// ---------------------------------------------------------------------------

/** Stable identity for a block in the graph. */
export type MutableBlockId = string & { readonly __mutableBlockId: unique symbol };
export const mutableBlockId = (s: string): MutableBlockId => s as MutableBlockId;

/** Stable identity for an obligation — derived from its semantic target for determinism. */
export type ObligationId = string & { readonly __obligationId: unique symbol };
export const obligationId = (s: string): ObligationId => s as ObligationId;

/**
 * A port field's identity in the constraint solver. Format:
 * `${blockId}:${slotName}:${fieldName}:${dir}`. The field-level key is what
 * the solver indexes — a bundle with 3 fields produces 3 keys. [LAW:decomposition]
 */
export type DraftPortDirection = 'in' | 'out';
export type DraftPortKey = string & { readonly __draftPortKey: unique symbol };
export interface DraftPortParts {
  readonly blockId: string;
  readonly slotName: string;
  readonly fieldName: string;
  readonly dir: DraftPortDirection;
}

export const draftPortKey = (
  blockId: string,
  slotName: string,
  fieldName: string,
  dir: DraftPortDirection,
): DraftPortKey => `${blockId}:${slotName}:${fieldName}:${dir}` as DraftPortKey;

export const parseDraftPortKey = (key: DraftPortKey): DraftPortParts => {
  // Keep the key format owned beside its constructor; callers receive fields,
  // never permission to duplicate the encoding. [LAW:one-source-of-truth]
  const parts = key.split(':');
  if (parts.length !== 4) {
    throw new Error(`Invalid DraftPortKey '${key}'`);
  }
  const [blockId, slotName, fieldName, dir] = parts as [string, string, string, string];
  if (dir !== 'in' && dir !== 'out') {
    throw new Error(`Invalid DraftPortKey direction '${dir}' in '${key}'`);
  }
  return { blockId, slotName, fieldName, dir };
};

// ---------------------------------------------------------------------------
// MutableGraph — blocks, edges, obligations
// ---------------------------------------------------------------------------

export type BlockOrigin =
  | { readonly kind: 'user' }
  | { readonly kind: 'elaboration'; readonly obligationId: ObligationId; readonly role: string };

export type EdgeOrigin =
  | { readonly kind: 'user' }
  | { readonly kind: 'elaboration'; readonly obligationId: ObligationId; readonly role: string };

/**
 * A block in the in-flight graph. `syntheticContract` lets the solver define
 * typed ports for synthesized system blocks (DefaultSource, Broadcast, etc.)
 * without registering them in the user-facing catalog. The constraint
 * extractor checks `syntheticContract` before falling back to catalog lookup.
 */
export interface MutableBlock {
  readonly id: string;
  readonly type: string;
  readonly origin: BlockOrigin;
  readonly syntheticContract?: ZBlockContract;
}

/**
 * An edge in the in-flight graph. Unlike `PillarEdge`, this records BOTH
 * `outputSlot` (source's output port) and `inputSlot` (target's input port)
 * so the constraint extractor can look up both port contracts unambiguously.
 */
export interface MutableEdge {
  readonly id: string;
  readonly source: string;
  readonly outputSlot: string;
  readonly target: string;
  readonly inputSlot: string;
  readonly origin: EdgeOrigin;
}

/**
 * The graph as seen by the fixpoint driver: blocks, edges, obligations, and
 * a revision counter. All three arrays are SORTED BY ID for determinism —
 * any function that appends to them must re-sort. [LAW:no-ambient-temporal-coupling]
 */
export interface MutableGraph {
  readonly blocks: readonly MutableBlock[];
  readonly edges: readonly MutableEdge[];
  readonly obligations: readonly Obligation[];
  readonly revision: number;
}

// ---------------------------------------------------------------------------
// Obligation lifecycle
// ---------------------------------------------------------------------------

export type ObligationKind =
  | 'missingInputSource'      // an input port has no incoming edge
  | 'needsAdapter'            // an edge's source and target types are incompatible
  | 'needsCardinalityAdapter' // an edge has a structural cardinality conflict
  | 'needsCycleBreak'         // the edge is a back edge in an algebraic cycle
  | 'needsPayloadAnchor';     // a polymorphic group has no concrete payload evidence

export type ObligationAnchor =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotName: string }
  | { readonly kind: 'edge'; readonly edgeId: string };

/**
 * Gates when the obligation's policy is eligible to fire. The driver checks
 * ALL deps before calling the policy — a dep not yet satisfied causes the
 * obligation to be skipped for this iteration. [LAW:no-ambient-temporal-coupling]
 *
 * `portHasUnresolvedPayload` is a POSITIVE dep meaning "the port still has a
 * payload variable, so there is work to do". If the payload resolves naturally
 * before this obligation is planned, the dep becomes unsatisfied and the
 * obligation is benignly skipped.
 */
export type FactDependency =
  | { readonly kind: 'portCanonicalizable'; readonly port: DraftPortKey }
  | { readonly kind: 'portPayloadResolved'; readonly port: DraftPortKey }
  | { readonly kind: 'portHasUnresolvedPayload'; readonly port: DraftPortKey };

export type ObligationStatus =
  | { readonly kind: 'open' }
  | { readonly kind: 'discharged'; readonly elaborated: { readonly blockIds: readonly string[]; readonly edgeIds: readonly string[] } }
  | { readonly kind: 'blocked'; readonly reason: string; readonly diagIds: readonly string[] };

export interface ObligationDebug {
  readonly createdBy: string;
  readonly note?: string;
}

export interface Obligation {
  readonly id: ObligationId;
  readonly kind: ObligationKind;
  readonly anchor: ObligationAnchor;
  readonly status: ObligationStatus;
  readonly deps: readonly FactDependency[];
  /** The policy to call. Name dispatched by the fixpoint driver. */
  readonly policy: { readonly name: string };
  readonly debug: ObligationDebug;
}

export const isOpen = (o: Obligation): boolean => o.status.kind === 'open';
export const isDischarged = (o: Obligation): boolean => o.status.kind === 'discharged';

export const discharged = (
  o: Obligation,
  blockIds: readonly string[],
  edgeIds: readonly string[],
): Obligation => ({ ...o, status: { kind: 'discharged', elaborated: { blockIds, edgeIds } } });

export const blocked = (o: Obligation, reason: string, diagIds: readonly string[] = []): Obligation =>
  ({ ...o, status: { kind: 'blocked', reason, diagIds } });

// ---------------------------------------------------------------------------
// ElaborationPlan — the data a policy produces
// ---------------------------------------------------------------------------

/**
 * A purely structural mutation to the graph: add blocks, add edges, replace
 * edges (atomic remove+add), optionally remove blocks. Plans never do type
 * work — they rewire the graph and let the next iteration's solver re-derive
 * types. [LAW:effects-at-boundaries] [LAW:dataflow-not-control-flow]
 */
export interface ElaborationPlan {
  readonly obligationId: ObligationId;
  readonly role: string;
  readonly addBlocks?: readonly MutableBlock[];
  readonly addEdges?: readonly MutableEdge[];
  /** Atomic edge replacement: remove the listed edge id, insert the new ones. */
  readonly replaceEdges?: readonly { readonly remove: string; readonly add: readonly MutableEdge[] }[];
  readonly removeBlockIds?: readonly string[];
  readonly diagnostics?: readonly FixpointDiagnostic[];
  readonly notes?: string;
}

// ---------------------------------------------------------------------------
// TypeFacts — per-field resolved hints computed each iteration
// ---------------------------------------------------------------------------

/**
 * A field's status after the solver runs. `ok` means a concrete
 * `ZCanonicalType` was computed (no remaining variables). `unknown` means
 * at least one axis is still a variable. `conflict` means the solver
 * detected incompatible concrete values on the same UF group.
 *
 * The 'ok' path uses `ZCanonicalTypeSchema.safeParse` as its SINGLE
 * inference→concrete bridge — the only place variables are pronounced gone.
 * [LAW:single-enforcer]
 */
export type PortHintStatus = 'ok' | 'unknown' | 'conflict';

export interface PortTypeHint {
  readonly status: PortHintStatus;
  readonly canonical?: ZCanonicalType;        // present when status === 'ok'
  readonly inference?: ZInferenceCanonicalType; // present when status === 'unknown'
  readonly diagIds: readonly string[];
}

export interface TypeFacts {
  /** Keyed by DraftPortKey (one entry per bundle field). */
  readonly ports: ReadonlyMap<DraftPortKey, PortTypeHint>;
  /** InstanceRef string → every port key resolved to that many-instance. */
  readonly instances: ReadonlyMap<string, readonly DraftPortKey[]>;
  /**
   * Which cardinality variables have `oneOrMany` acceptance (i.e., the port
   * tolerates either one or many and should not generate a cardinality adapter
   * obligation). Computed from port declarations that share a variable between
   * input and output without a forceMany constraint.
   */
  readonly portAcceptance: ReadonlyMap<DraftPortKey, 'oneOrMany' | 'oneOnly' | 'manyOnly'>;
}

// ---------------------------------------------------------------------------
// StrictTypedGraph — success output
// ---------------------------------------------------------------------------

export interface StrictTypedGraph {
  readonly graph: MutableGraph;
  /** Every field-level port key → concrete resolved type. */
  readonly portTypes: ReadonlyMap<DraftPortKey, ZCanonicalType>;
  readonly diagnostics: readonly FixpointDiagnostic[];
}

// ---------------------------------------------------------------------------
// FixpointDiagnostic — driver-layer signals
// ---------------------------------------------------------------------------

export type FixpointDiagnosticCode =
  | 'NonConvergence'
  | 'OpenObligation'
  | 'UnresolvedPort'
  | 'CheaterAdapterUsed'
  | 'TypeConflict'
  // validateAxes codes
  | 'EventInvariantBroken'
  | 'NoInstance'
  | 'AdapterShapeError'
  | 'CategoryGatingError'
  | 'VarEscape';

export interface FixpointDiagnostic {
  readonly code: FixpointDiagnosticCode;
  readonly message: string;
  readonly stableKey: string;
  readonly obligationId?: ObligationId;
  readonly ports?: readonly DraftPortKey[];
}

// ---------------------------------------------------------------------------
// FixpointResult — what resolveTypes returns
// ---------------------------------------------------------------------------

export interface FixpointResult {
  readonly graph: MutableGraph;
  readonly facts: TypeFacts;
  /** Non-null iff the solver converged with all ports resolved. */
  readonly strict: StrictTypedGraph | null;
  readonly diagnostics: readonly FixpointDiagnostic[];
  readonly iterations: number;
}
