/**
 * Type Compatibility Oracle — single authority for frontend edge compatibility.
 *
 * All frontend decision points that ask "are these two types compatible?" or
 * "does this port accept broadcast?" route through this module.
 *
 * // [LAW:one-source-of-truth] One place decides type/cardinality compatibility.
 * // [LAW:single-enforcer] No block-name dispatch — all decisions derive from
 *    CT/ICT axis declarations and CanonicalType structure.
 */

import {
  type CanonicalType,
  requireInst,
  payloadsEqual,
  unitsEqual,
} from '../../../core/canonical-types';
import type { CardinalityAcceptance } from '../../../core/canonical-types/cardinality';

// =============================================================================
// Port Policy Queries
// =============================================================================

/**
 * Does a pre-extracted acceptance value indicate broadcast flexibility?
 *
 * Returns true when the acceptance is 'oneOrMany', meaning the port accepts
 * both signal (one) and field (many) cardinality sources.
 *
 * Callers supply acceptance from TypeFacts.portAcceptance or
 * TypeResolvedPatch.portAcceptance — no BlockDef lookup needed.
 *
 * // [LAW:one-source-of-truth] Acceptance is derived from CT/ICT axis data,
 *    pre-extracted during constraint extraction and threaded through TypeFacts.
 */
export function acceptsBroadcast(
  acceptance: CardinalityAcceptance | undefined,
): boolean {
  return acceptance === 'oneOrMany';
}

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Edge type compatibility — pure function over CanonicalType structure.
 *
 * Checks whether a source type can flow into a destination type on a wired
 * connection. No block metadata, no name dispatch — only type facts.
 *
 * Rules:
 * 1. Payload must match (structural equality)
 * 2. Unit must match (structural equality)
 * 3. Temporality must match
 * 4. Cardinality must match, with broadcast exception:
 *    one→many is allowed when allowsBroadcast is true
 * 5. For 'many' cardinality: instance must match (domainTypeId + instanceId)
 */
export function isEdgeTypeCompatible(
  from: CanonicalType,
  to: CanonicalType,
  allowsBroadcast = false,
): boolean {
  const fromCard = requireInst(from.extent.cardinality, 'cardinality');
  const fromTemp = requireInst(from.extent.temporality, 'temporality');
  const toCard = requireInst(to.extent.cardinality, 'cardinality');
  const toTemp = requireInst(to.extent.temporality, 'temporality');

  // Payload must match (structural equality — solver may produce non-singleton objects)
  if (!payloadsEqual(from.payload, to.payload)) {
    return false;
  }

  // Unit must match (structural equality — handles nested fields like angle subkind)
  if (!unitsEqual(from.unit, to.unit)) {
    return false;
  }

  // Temporality must match
  if (fromTemp.kind !== toTemp.kind) {
    return false;
  }

  // Cardinality must match, with broadcast exception
  if (fromCard.kind !== toCard.kind) {
    // Allow one → many when destination policy permits signal-to-field promotion.
    if (allowsBroadcast && fromCard.kind === 'one' && toCard.kind === 'many') {
      return true;
    }
    return false;
  }

  // For 'many' cardinality, instance must also match
  if (fromCard.kind === 'many' && toCard.kind === 'many') {
    const fromInstance = fromCard.instance;
    const toInstance = toCard.instance;
    if (!fromInstance || !toInstance) return false;
    return fromInstance.domainTypeId === toInstance.domainTypeId &&
      fromInstance.instanceId === toInstance.instanceId;
  }

  return true;
}

// =============================================================================
// Cardinality Mismatch Classification
// =============================================================================

/**
 * Is the ONLY difference between from and to a one↔many cardinality mismatch?
 *
 * Returns true when payload, unit, and temporality all match but cardinality
 * differs between one and many (in either direction). Used to defer
 * cardinality-only coercion when a port declares oneOrMany flexibility.
 */
export function isOneManyMismatchOnly(from: CanonicalType, to: CanonicalType): boolean {
  if (!payloadsEqual(from.payload, to.payload)) return false;
  if (!unitsEqual(from.unit, to.unit)) return false;
  const fromTemp = requireInst(from.extent.temporality, 'temporality');
  const toTemp = requireInst(to.extent.temporality, 'temporality');
  if (fromTemp.kind !== toTemp.kind) return false;
  const fromCard = requireInst(from.extent.cardinality, 'cardinality');
  const toCard = requireInst(to.extent.cardinality, 'cardinality');
  return (
    (fromCard.kind === 'one' && toCard.kind === 'many')
    || (fromCard.kind === 'many' && toCard.kind === 'one')
  );
}
