/**
 * Adapter Registry
 *
 * Defines which block types can adapt between SignalType mismatches.
 * Used by graph normalization to automatically insert adapters.
 *
 * This is the SINGLE source of truth for type coercion adapters.
 * The compiler does NO coercion - all adapters are inserted here.
 *
 * Spec Reference: design-docs/_new/0-Units-and-Adapters.md Part B
 *
 * Required adapters for v2.5 (§B4.1):
 * - Phase/angle: PhaseToScalar01, ScalarToPhase01, PhaseToRadians, RadiansToPhase01,
 *                DegreesToRadians, RadiansToDegrees
 * - Time: MsToSeconds, SecondsToMs
 * - Normalization: ScalarToNorm01Clamp, Norm01ToScalar
 *
 * Disallowed adapters (§B4.2):
 * - Phase01ToNorm01 (semantic ambiguity — use PhaseToScalar01 or PhaseToRadians)
 * - Any int↔float without explicit rounding policy
 */

import type { SignalType, PayloadType, Unit } from '../core/canonical-types';
import { getAxisValue, DEFAULTS_V0, unitsEqual, isUnitVar } from '../core/canonical-types';

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
  readonly unit: Unit | 'any';
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
 * Order matters — more specific rules before general rules; first match wins.
 */
const ADAPTER_RULES: AdapterRule[] = [
  // ==========================================================================
  // Unit-conversion adapters (Spec §B4.1)
  // Adapters are cardinality-preserving (§B6), so cardinality/temporality = 'any'
  // ==========================================================================

  // --- Phase / Scalar ---
  {
    from: { payload: 'float', unit: { kind: 'phase01' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'scalar' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_PhaseToScalar01',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Phase [0,1) → scalar (semantic boundary)',
    },
  },
  {
    from: { payload: 'float', unit: { kind: 'scalar' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'phase01' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_ScalarToPhase01',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Scalar → phase [0,1) with wrapping',
    },
  },

  // --- Phase / Radians ---
  {
    from: { payload: 'float', unit: { kind: 'phase01' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'radians' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_PhaseToRadians',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Phase [0,1) → radians [0,2π)',
    },
  },
  {
    from: { payload: 'float', unit: { kind: 'radians' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'phase01' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_RadiansToPhase01',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Radians → phase [0,1) with wrapping',
    },
  },

  // --- Degrees / Radians ---
  {
    from: { payload: 'float', unit: { kind: 'degrees' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'radians' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_DegreesToRadians',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Degrees → radians',
    },
  },
  {
    from: { payload: 'float', unit: { kind: 'radians' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'degrees' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_RadiansToDegrees',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Radians → degrees',
    },
  },

  // --- Time ---
  {
    from: { payload: 'int', unit: { kind: 'ms' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'seconds' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_MsToSeconds',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Milliseconds (int) → seconds (float)',
    },
  },
  {
    from: { payload: 'float', unit: { kind: 'seconds' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'int', unit: { kind: 'ms' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_SecondsToMs',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Seconds (float) → milliseconds (int, rounded)',
    },
  },

  // --- Normalization ---
  {
    from: { payload: 'float', unit: { kind: 'scalar' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'norm01' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_ScalarToNorm01Clamp',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Scalar → normalized [0,1] with clamping',
    },
  },
  {
    from: { payload: 'float', unit: { kind: 'norm01' }, cardinality: 'any', temporality: 'any' },
    to: { payload: 'float', unit: { kind: 'scalar' }, cardinality: 'any', temporality: 'any' },
    adapter: {
      blockType: 'Adapter_Norm01ToScalar',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Normalized [0,1] → scalar (identity)',
    },
  },

  // ==========================================================================
  // Cardinality promotion: one -> many (broadcast)
  // ==========================================================================

  // Broadcast — works for any payload type (float, vec2, color, etc.).
  // The Broadcast block is payload-generic and resolves type from context.
  // Must be AFTER unit adapters (more specific rules first).
  {
    from: { payload: 'any', unit: 'any', cardinality: 'one', temporality: 'continuous' },
    to: { payload: 'any', unit: 'any', cardinality: 'many', temporality: 'continuous' },
    adapter: {
      blockType: 'Broadcast',
      inputPortId: 'signal',
      outputPortId: 'field',
      description: 'Broadcast signal to field',
    },
  },
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
    unit: type.unit,
    cardinality: cardinality.kind,
    temporality: temporality.kind,
  };
}

/**
 * Check if a type signature matches a pattern.
 */
function signatureMatches(actual: TypeSignature, pattern: TypeSignature): boolean {
  // Payload must match unless pattern allows 'any'
  if (pattern.payload !== 'any' && actual.payload !== pattern.payload) {
    return false;
  }
  // Unit must match unless pattern allows 'any'
  if (pattern.unit !== 'any') {
    const actualUnit = actual.unit;
    if (actualUnit === 'any') return false; // actual shouldn't be 'any' in practice
    if (!unitsEqual(actualUnit as Unit, pattern.unit)) return false;
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

  // Search for matching adapter rule (first match wins)
  for (const rule of ADAPTER_RULES) {
    if (signatureMatches(fromSig, rule.from) && signatureMatches(toSig, rule.to)) {
      // For rules with 'any' payload on both sides, require actual payloads to match
      if (rule.from.payload === 'any' && rule.to.payload === 'any') {
        if (fromSig.payload !== toSig.payload) {
          continue;
        }
      }
      // For rules with 'any' unit on both sides, require actual units to match
      // Exception: unit variables (unitVar) are polymorphic and match any concrete unit
      if (rule.from.unit === 'any' && rule.to.unit === 'any') {
        const fromUnit = fromSig.unit;
        const toUnit = toSig.unit;
        if (fromUnit !== 'any' && toUnit !== 'any') {
          // Unit variables are polymorphic - they can match any unit
          const fromIsVar = isUnitVar(fromUnit as Unit);
          const toIsVar = isUnitVar(toUnit as Unit);
          if (!fromIsVar && !toIsVar && !unitsEqual(fromUnit as Unit, toUnit as Unit)) {
            continue;
          }
        }
      }
      return rule.adapter;
    }
  }

  return null;
}

/**
 * Check if two type signatures are directly compatible (no adapter needed).
 */
function typesAreCompatible(from: TypeSignature, to: TypeSignature): boolean {
  // Payload must match
  if (from.payload !== to.payload) return false;

  // Unit must match
  const fromUnit = from.unit;
  const toUnit = to.unit;
  if (fromUnit !== 'any' && toUnit !== 'any') {
    if (!unitsEqual(fromUnit as Unit, toUnit as Unit)) return false;
  }

  return (
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
