/**
 * Adapter Registry
 *
 * Defines which block types can adapt between SignalType mismatches.
 * Used by graph normalization to automatically insert adapters.
 *
 * This is the SINGLE source of truth for type coercion adapters.
 * The compiler does NO coercion - all adapters are inserted here.
 */

import type { SignalType, Cardinality, Temporality, PayloadType } from '../core/canonical-types';
import { getAxisValue, DEFAULTS_V0 } from '../core/canonical-types';

// =============================================================================
// Adapter Specification
// =============================================================================

/**
 * Describes an adapter that can convert between type signatures.
 */
export interface AdapterSpec {
  /** Block type to insert (must be registered in block registry) */
  readonly blockType: string;

  /** Input port ID on the adapter block */
  readonly inputPortId: string;

  /** Output port ID on the adapter block */
  readonly outputPortId: string;

  /** Description for debugging/UI */
  readonly description: string;
}

/**
 * Type signature for matching adapters.
 * Uses 'any' for axes that can be any value.
 */
export interface TypeSignature {
  readonly payload: PayloadType | 'any';
  readonly cardinality: 'zero' | 'one' | 'many' | 'any';
  readonly temporality: 'continuous' | 'discrete' | 'any';
}

/**
 * Adapter rule: from signature -> to signature -> adapter spec
 */
export interface AdapterRule {
  readonly from: TypeSignature;
  readonly to: TypeSignature;
  readonly adapter: AdapterSpec;
}

// =============================================================================
// Adapter Rules Registry
// =============================================================================

/**
 * Registered adapter rules.
 * Order matters - first matching rule wins.
 */
const ADAPTER_RULES: AdapterRule[] = [
  // ==========================================================================
  // Cardinality promotion: one -> many (broadcast)
  // ==========================================================================

  // Polymorphic broadcast - works for any payload type (float, vec2, color, etc.)
  // The FieldBroadcast block is payload-generic and resolves type from context
  {
    from: { payload: 'any', cardinality: 'one', temporality: 'continuous' },
    to: { payload: 'any', cardinality: 'many', temporality: 'continuous' },
    adapter: {
      blockType: 'FieldBroadcast',
      inputPortId: 'signal',
      outputPortId: 'field',
      description: 'Broadcast signal to field (polymorphic)',
    },
  },

  // TODO: Add more adapters as needed:
  // - FieldReduce for many -> one
  // - float <-> int conversions
  // - etc.
];

// =============================================================================
// Signature Matching
// =============================================================================

/**
 * Extract a type signature from a SignalType.
 */
export function extractSignature(type: SignalType): TypeSignature {
  const cardinality = getAxisValue(type.extent.cardinality, DEFAULTS_V0.cardinality);
  const temporality = getAxisValue(type.extent.temporality, DEFAULTS_V0.temporality);

  return {
    payload: type.payload,
    cardinality: cardinality.kind,
    temporality: temporality.kind,
  };
}

/**
 * Check if a type signature matches a pattern.
 *
 * Payload-generic blocks use BlockPayloadMetadata for validation.
 */
function signatureMatches(actual: TypeSignature, pattern: TypeSignature): boolean {
  // Payload must match unless pattern allows 'any'
  if (pattern.payload !== 'any' && actual.payload !== pattern.payload) {
    return false;
  }
  if (pattern.cardinality !== 'any' && actual.cardinality !== pattern.cardinality) {
    return false;
  }
  if (pattern.temporality !== 'any' && actual.temporality !== pattern.temporality) {
    return false;
  }
  return true;
}

// =============================================================================
// Adapter Lookup
// =============================================================================

/**
 * Find an adapter that can convert from one type to another.
 *
 * @param from - Source SignalType
 * @param to - Target SignalType
 * @returns AdapterSpec if an adapter exists, null otherwise
 */
export function findAdapter(from: SignalType, to: SignalType): AdapterSpec | null {
  const fromSig = extractSignature(from);
  const toSig = extractSignature(to);

  // If types are already compatible, no adapter needed
  if (typesAreCompatible(fromSig, toSig)) {
    return null;
  }

  // Search for matching adapter rule
  for (const rule of ADAPTER_RULES) {
    if (signatureMatches(fromSig, rule.from) && signatureMatches(toSig, rule.to)) {
      // For rules with 'any' payload on both sides, require actual payloads to match
      if (rule.from.payload === 'any' && rule.to.payload === 'any') {
        if (fromSig.payload !== toSig.payload) {
          continue; // Payload mismatch, try next rule
        }
      }
      return rule.adapter;
    }
  }

  return null;
}

/**
 * Check if two type signatures are directly compatible (no adapter needed).
 *
 * Payload-generic blocks use BlockPayloadMetadata for validation.
 */
function typesAreCompatible(from: TypeSignature, to: TypeSignature): boolean {
  const payloadMatch = from.payload === to.payload;
  return (
    payloadMatch &&
    from.cardinality === to.cardinality &&
    from.temporality === to.temporality
  );
}

/**
 * Check if types need an adapter (and one exists).
 */
export function needsAdapter(from: SignalType, to: SignalType): boolean {
  const fromSig = extractSignature(from);
  const toSig = extractSignature(to);

  return !typesAreCompatible(fromSig, toSig) && findAdapter(from, to) !== null;
}

// =============================================================================
// Debug/Info
// =============================================================================

/**
 * Get all registered adapter rules (for debugging/UI).
 */
export function getAllAdapterRules(): readonly AdapterRule[] {
  return ADAPTER_RULES;
}
