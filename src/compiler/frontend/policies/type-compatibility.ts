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
  isAxisVar,
  resolveCardinalityPolicy,
} from '../../../core/canonical-types';
import { getBlockDefinition } from '../../../blocks/registry';

// =============================================================================
// Port Policy Queries
// =============================================================================

/**
 * Does this port's CT/ICT cardinality axis declare oneOrMany acceptance?
 *
 * Returns true when the port's cardinality var has a declared policy with
 * acceptance:'oneOrMany', meaning it accepts both signal (one) and field (many)
 * cardinality sources.
 *
 * Used by:
 * - Pass 2 type graph: determines the allowsBroadcast flag for edge validation
 * - Obligation creation: defers cardinality-only mismatches when either endpoint
 *   is flexible (letting the solver handle unification)
 *
 * // [LAW:one-source-of-truth] Cardinality compatibility is declared on port types.
 */
export function portAcceptsBroadcast(
  blockType: string,
  port: string,
  dir: 'in' | 'out' = 'in',
): boolean {
  const def = getBlockDefinition(blockType);
  if (!def) return false;
  const portDef = dir === 'in' ? def.inputs[port] : def.outputs[port];
  const axis = portDef?.type?.extent?.cardinality;
  if (!axis || !isAxisVar(axis)) return false;
  const cardAxis = axis as any;
  const hasDeclaredPolicy = cardAxis.relation !== undefined
    || cardAxis.acceptance !== undefined
    || cardAxis.instanceBinding !== undefined;
  if (!hasDeclaredPolicy) return false;
  const policy = resolveCardinalityPolicy(axis);
  return policy?.acceptance === 'oneOrMany';
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
