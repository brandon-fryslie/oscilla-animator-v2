/**
 * Adapter Registry
 *
 * Defines which block types can adapt between CanonicalType mismatches.
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

import type { CanonicalType, PayloadType, UnitType, Extent } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION, DEFAULTS_V0, unitsEqual } from '../core/canonical-types';

// =============================================================================
// Adapter Specification (Spec-aligned, Decision D6)
// =============================================================================

/**
 * Pattern for matching extent values.
 * - 'any': matches any extent
 * - Partial<Extent>: matches specific axis values
 */
export type ExtentPattern =
  | 'any'
  | Partial<{ [K in keyof Extent]: Extent[K] }>;

/**
 * Transform for extent values through an adapter.
 * - 'preserve': keep input extent unchanged
 * - Partial<Extent>: change specific axes (e.g., broadcast: one→many)
 * 
 * Decision D6: Limited to preserve, broadcast (one→many), reduce (many→one)
 */
export type ExtentTransform =
  | 'preserve'
  | Partial<{ [K in keyof Extent]: Extent[K] }>;

/**
 * Type pattern for adapter matching.
 * - 'same': output matches input for this component
 * - 'any': matches any value for this component
 * - Specific type: matches/produces this specific type
 */
export interface TypePattern {
  readonly payload: PayloadType | 'same' | 'any';
  readonly unit: UnitType | 'same' | 'any';
  readonly extent: ExtentPattern;
}

/**
 * Describes an adapter block that can convert between types.
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
  
  /** Purity: adapters must be pure (no time/state dependence) */
  readonly purity: 'pure';
  
  /** Stability: same input always produces same output */
  readonly stability: 'stable';
}

/**
 * Adapter rule: pattern-based matching for type conversion.
 */
export interface AdapterRule {
  readonly from: TypePattern;
  readonly to: TypePattern;
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
  // Adapters are extent-preserving (§B6), so extent = 'any'
  // ==========================================================================

  // --- Phase / Scalar ---
  {
    from: { payload: FLOAT, unit: { kind: 'phase01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_PhaseToScalar01',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Phase [0,1) → scalar (semantic boundary)',
      purity: 'pure',
      stability: 'stable',
    },
  },
  {
    from: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'phase01' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_ScalarToPhase01',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Scalar → phase [0,1) with wrapping',
      purity: 'pure',
      stability: 'stable',
    },
  },

  // --- Phase / Radians ---
  {
    from: { payload: FLOAT, unit: { kind: 'phase01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'radians' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_PhaseToRadians',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Phase [0,1) → radians [0,2π)',
      purity: 'pure',
      stability: 'stable',
    },
  },
  {
    from: { payload: FLOAT, unit: { kind: 'radians' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'phase01' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_RadiansToPhase01',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Radians → phase [0,1) with wrapping',
      purity: 'pure',
      stability: 'stable',
    },
  },

  // --- Degrees / Radians ---
  {
    from: { payload: FLOAT, unit: { kind: 'degrees' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'radians' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_DegreesToRadians',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Degrees → radians',
      purity: 'pure',
      stability: 'stable',
    },
  },
  {
    from: { payload: FLOAT, unit: { kind: 'radians' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'degrees' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_RadiansToDegrees',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Radians → degrees',
      purity: 'pure',
      stability: 'stable',
    },
  },

  // --- Time ---
  {
    from: { payload: INT, unit: { kind: 'ms' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'seconds' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_MsToSeconds',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Milliseconds (int) → seconds (float)',
      purity: 'pure',
      stability: 'stable',
    },
  },
  {
    from: { payload: FLOAT, unit: { kind: 'seconds' }, extent: 'any' },
    to: { payload: INT, unit: { kind: 'ms' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_SecondsToMs',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Seconds (float) → milliseconds (int, rounded)',
      purity: 'pure',
      stability: 'stable',
    },
  },

  // --- Normalization ---
  {
    from: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'norm01' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_ScalarToNorm01Clamp',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Scalar → normalized [0,1] with clamping',
      purity: 'pure',
      stability: 'stable',
    },
  },
  {
    from: { payload: FLOAT, unit: { kind: 'norm01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    adapter: {
      blockType: 'Adapter_Norm01ToScalar',
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Normalized [0,1] → scalar (identity)',
      purity: 'pure',
      stability: 'stable',
    },
  },

  // ==========================================================================
  // Cardinality promotion: one -> many (broadcast)
  // ==========================================================================

  // Broadcast — works for any payload type (float, vec2, color, etc.).
  // The Broadcast block is payload-generic and resolves type from context.
  // Must be AFTER unit adapters (more specific rules first).
  // TODO: Extent pattern matching needs inference to resolve instance parameter
  {
    from: { payload: 'any', unit: 'any', extent: 'any' }, // TODO: card=one, tempo=continuous
    to: { payload: 'same', unit: 'same', extent: 'any' }, // TODO: card=many(instance), tempo=continuous
    adapter: {
      blockType: 'Broadcast',
      inputPortId: 'signal',
      outputPortId: 'field',
      description: 'Broadcast signal to field',
      purity: 'pure',
      stability: 'stable',
    },
  },
];

// =============================================================================
// Pattern Matching
// =============================================================================

/**
 * Extract a type pattern from a CanonicalType for matching.
 */
export function extractPattern(type: CanonicalType): TypePattern {
  return {
    payload: type.payload,
    unit: type.unit,
    extent: type.extent, // Full extent for precise matching
  };
}

/**
 * Check if an extent matches a pattern.
 */
function extentMatches(actual: Extent, pattern: ExtentPattern): boolean {
  if (pattern === 'any') return true;
  
  // Partial extent pattern - check specified axes
  for (const key in pattern) {
    const k = key as keyof Extent;
    const patternAxis = pattern[k];
    const actualAxis = actual[k];
    
    if (!patternAxis) continue;
    
    // Both must be inst with same value kind (detailed comparison needed)
    // For now, simplified: require exact match if pattern specifies
    if (JSON.stringify(actualAxis) !== JSON.stringify(patternAxis)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if a type pattern matches another pattern.
 */
function patternMatches(actual: TypePattern, pattern: TypePattern): boolean {
  // Payload must match unless pattern allows 'any' or 'same'
  if (pattern.payload !== 'any' && pattern.payload !== 'same') {
    if (actual.payload !== pattern.payload) {
      return false;
    }
  }
  
  // Unit must match unless pattern allows 'any' or 'same'
  if (pattern.unit !== 'any' && pattern.unit !== 'same') {
    const actualUnit = actual.unit;
    if (actualUnit === 'any' || actualUnit === 'same') return false;
    if (!unitsEqual(actualUnit as UnitType, pattern.unit)) return false;
  }
  
  // Extent must match
  if (actual.extent === 'any') {
    // Actual shouldn't be 'any' in practice, but allow it for rules
    return pattern.extent === 'any';
  }
  
  return extentMatches(actual.extent as Extent, pattern.extent);
}

/**
 * Check if two type patterns are directly compatible (no adapter needed).
 */
function patternsAreCompatible(from: TypePattern, to: TypePattern): boolean {
  // Payload must match
  if (from.payload !== to.payload) return false;

  // Unit must match
  const fromUnit = from.unit;
  const toUnit = to.unit;
  if (fromUnit !== 'any' && toUnit !== 'any' && fromUnit !== 'same' && toUnit !== 'same') {
    if (!unitsEqual(fromUnit as UnitType, toUnit as UnitType)) return false;
  }

  // Extent must match exactly
  if (from.extent === 'any' || to.extent === 'any') return true;
  return JSON.stringify(from.extent) === JSON.stringify(to.extent);
}

// =============================================================================
// Adapter Lookup
// =============================================================================

/**
 * Find an adapter that can convert from one type to another.
 *
 * @param from - Source CanonicalType
 * @param to - Target CanonicalType
 * @returns AdapterSpec if an adapter exists, null otherwise
 */
export function findAdapter(from: CanonicalType, to: CanonicalType): AdapterSpec | null {
  const fromPattern = extractPattern(from);
  const toPattern = extractPattern(to);

  // If types are already compatible, no adapter needed
  if (patternsAreCompatible(fromPattern, toPattern)) {
    return null;
  }

  // Search for matching adapter rule (first match wins)
  for (const rule of ADAPTER_RULES) {
    if (patternMatches(fromPattern, rule.from) && patternMatches(toPattern, rule.to)) {
      // For rules with 'any' payload on both sides, require actual payloads to match
      if (rule.from.payload === 'any' && rule.to.payload === 'any') {
        if (fromPattern.payload !== toPattern.payload) {
          continue;
        }
      }
      // For rules with 'any' unit on both sides, require actual units to match
      if (rule.from.unit === 'any' && rule.to.unit === 'any') {
        const fromUnit = fromPattern.unit;
        const toUnit = toPattern.unit;
        if (fromUnit !== 'any' && toUnit !== 'any' && fromUnit !== 'same' && toUnit !== 'same') {
          if (!unitsEqual(fromUnit as UnitType, toUnit as UnitType)) {
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
 * Check if types need an adapter (and one exists).
 */
export function needsAdapter(from: CanonicalType, to: CanonicalType): boolean {
  const fromPattern = extractPattern(from);
  const toPattern = extractPattern(to);

  return !patternsAreCompatible(fromPattern, toPattern) && findAdapter(from, to) !== null;
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
