/**
 * Obligation System — Deferred elaboration for normalization fixpoint.
 *
 * An Obligation represents work that cannot be done until type information
 * is available. Obligations are created deterministically, evaluated repeatedly,
 * and discharged when their dependencies are satisfied.
 *
 * // [LAW:one-source-of-truth] Obligation ID is the single identity for deferred work.
 * // [LAW:dataflow-not-control-flow] Status is always present; open/discharged/blocked are values, not branches.
 */

import type { DraftPortRef } from './draft-graph';

// =============================================================================
// Branded ID
// =============================================================================

/** Deterministic obligation ID, derived from semantic target. */
export type ObligationId = string & { readonly __brand: 'ObligationId' };

// =============================================================================
// Obligation Kinds
// =============================================================================

export type ObligationKind =
  | 'missingInputSource'
  | 'needsAdapter'
  | 'needsCardinalityAdapter'
  | 'needsLaneAlignment'
  | 'needsDomainElaboration'
  | 'needsPayloadAnchor';

// =============================================================================
// Fact Dependencies
// =============================================================================

export type FactDependency =
  | { readonly kind: 'portCanonicalizable'; readonly port: DraftPortRef }
  | { readonly kind: 'portPayloadResolved'; readonly port: DraftPortRef }
  | { readonly kind: 'portUnitResolved'; readonly port: DraftPortRef }
  | { readonly kind: 'portAxisResolved'; readonly port: DraftPortRef; readonly axis: string }
  | { readonly kind: 'portHasUnresolvedPayload'; readonly port: DraftPortRef };

// =============================================================================
// Obligation Status
// =============================================================================

export interface ElaboratedArtifactRefs {
  readonly blockIds: readonly string[];
  readonly edgeIds: readonly string[];
}

export type ObligationStatus =
  | { readonly kind: 'open' }
  | { readonly kind: 'discharged'; readonly elaborated: ElaboratedArtifactRefs }
  | { readonly kind: 'blocked'; readonly reason: string; readonly diagIds: readonly string[] };

// =============================================================================
// Obligation Anchor
// =============================================================================

export interface ObligationAnchor {
  readonly port?: DraftPortRef;
  readonly edgeId?: string;
  readonly blockId?: string;
  readonly laneGroupId?: string;
}

// =============================================================================
// Policy Reference
// =============================================================================

export interface ObligationPolicyRef {
  readonly name: string;
  readonly version: number;
}

// =============================================================================
// Debug Info
// =============================================================================

export interface ObligationDebug {
  readonly createdBy: string;
  readonly note?: string;
}

// =============================================================================
// Obligation
// =============================================================================

export interface Obligation {
  readonly id: ObligationId;
  readonly kind: ObligationKind;
  readonly anchor: ObligationAnchor;
  readonly status: ObligationStatus;
  readonly deps: readonly FactDependency[];
  readonly policy: ObligationPolicyRef;
  readonly debug: ObligationDebug;
}

// =============================================================================
// Helpers
// =============================================================================

/** Check if an obligation is open (waiting for deps or ready to plan). */
export function isOpen(o: Obligation): boolean {
  return o.status.kind === 'open';
}

/** Check if an obligation has been discharged. */
export function isDischarged(o: Obligation): boolean {
  return o.status.kind === 'discharged';
}

/** Check if an obligation is permanently blocked. */
export function isBlocked(o: Obligation): boolean {
  return o.status.kind === 'blocked';
}

/** Create a discharged status with artifact refs. */
export function discharged(blockIds: readonly string[], edgeIds: readonly string[]): ObligationStatus {
  return { kind: 'discharged', elaborated: { blockIds, edgeIds } };
}

/** Create a blocked status with reason. */
export function blocked(reason: string, diagIds: readonly string[] = []): ObligationStatus {
  return { kind: 'blocked', reason, diagIds };
}
