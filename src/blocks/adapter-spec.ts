/**
 * Adapter Specification
 *
 * Defines adapter block type conversion patterns and matching logic.
 * Moved from graph layer to blocks layer (2026-02-01).
 *
 * Each adapter block self-declares its conversion pattern via BlockDef.adapterSpec.
 * This is the SINGLE source of truth for type coercion adapters.
 * The compiler does NO coercion - all adapters are inserted by graph normalization.
 *
 * Spec Reference: design-docs/_new/0-Units-and-Adapters.md Part B
 */

import type { UnitType, Extent } from '../core/canonical-types';
import type { InferenceCanonicalType, InferencePayloadType, InferenceUnitType } from '../core/inference-types';
import { unitsEqual } from '../core/canonical-types';
import { BLOCK_DEFS_BY_TYPE } from './registry';

// =============================================================================
// Adapter Specification Types
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
  readonly payload: InferencePayloadType | 'same' | 'any';
  readonly unit: InferenceUnitType | 'same' | 'any';
  readonly extent: ExtentPattern;
}

/**
 * Adapter block specification (stored on BlockDef).
 * Does NOT include blockType (implicit from BlockDef.type).
 */
export interface AdapterBlockSpec {
  /** Input type pattern this adapter converts FROM */
  readonly from: TypePattern;
  /** Output type pattern this adapter converts TO */
  readonly to: TypePattern;
  /** Input port ID on the adapter block */
  readonly inputPortId: string;
  /** Output port ID on the adapter block */
  readonly outputPortId: string;
  /** Description for debugging/UI */
  readonly description: string;
  /** Purity: adapters must be pure */
  readonly purity: 'pure';
  /** Stability: same input always produces same output */
  readonly stability: 'stable';
  /** Priority for matching (lower = higher priority, default 0) */
  readonly priority?: number;
}

/**
 * Adapter spec with blockType (return type for findAdapter).
 * Includes blockType field for backwards compatibility.
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
 * Adapter rule: pattern-based matching for type conversion (internal).
 */
interface AdapterRule {
  readonly blockType: string;
  readonly from: TypePattern;
  readonly to: TypePattern;
  readonly spec: AdapterSpec;
  readonly priority: number;
}

// =============================================================================
// Pattern Matching
// =============================================================================

/**
 * Extract a type pattern from a CanonicalType for matching.
 */
export function extractPattern(type: InferenceCanonicalType): TypePattern {
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
    if (actualUnit.kind === 'var' || pattern.unit.kind === 'var') return true; // vars match anything
    if (!unitsEqual(actualUnit as UnitType, pattern.unit as UnitType)) return false;
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
// Adapter Lookup (builds from BlockDef registry)
// =============================================================================

/**
 * Build adapter rules from BlockDef registry.
 * Called lazily on first findAdapter call.
 */
function buildAdapterRules(): AdapterRule[] {
  const rules: AdapterRule[] = [];

  for (const [blockType, blockDef] of BLOCK_DEFS_BY_TYPE) {
    if (!blockDef.adapterSpec) continue;

    const spec = blockDef.adapterSpec;
    const adapterSpec: AdapterSpec = {
      blockType,
      inputPortId: spec.inputPortId,
      outputPortId: spec.outputPortId,
      description: spec.description,
      purity: spec.purity,
      stability: spec.stability,
    };

    rules.push({
      blockType,
      from: spec.from,
      to: spec.to,
      spec: adapterSpec,
      priority: spec.priority ?? 0,
    });
  }

  // Sort by priority (lower = higher priority, first match wins)
  rules.sort((a, b) => a.priority - b.priority);

  return rules;
}

// Lazy-initialized adapter rules cache
let cachedRules: AdapterRule[] | null = null;

/**
 * Get adapter rules (builds from registry on first call).
 */
function getAdapterRules(): AdapterRule[] {
  if (!cachedRules) {
    cachedRules = buildAdapterRules();
  }
  return cachedRules;
}

/**
 * Find an adapter that can convert from one type to another.
 *
 * @param from - Source CanonicalType
 * @param to - Target CanonicalType
 * @returns AdapterSpec if an adapter exists, null otherwise
 */
export function findAdapter(from: InferenceCanonicalType, to: InferenceCanonicalType): AdapterSpec | null {
  const fromPattern = extractPattern(from);
  const toPattern = extractPattern(to);

  // If types are already compatible, no adapter needed
  if (patternsAreCompatible(fromPattern, toPattern)) {
    return null;
  }

  // Search for matching adapter rule (first match wins, sorted by priority)
  const rules = getAdapterRules();
  for (const rule of rules) {
    if (patternMatches(fromPattern, rule.from) && patternMatches(toPattern, rule.to)) {
      // For rules with 'any' payload on both sides, require actual payloads to match
      if (rule.from.payload === 'any' && rule.to.payload === 'any') {
        if (fromPattern.payload !== toPattern.payload) {
          continue;
        }
      }
      // For rules with 'same' or 'any' unit, require actual units to match
      // (adapters that preserve units must not match when units differ)
      if (rule.to.unit === 'same' || (rule.from.unit === 'any' && rule.to.unit === 'any')) {
        const fromUnit = fromPattern.unit;
        const toUnit = toPattern.unit;
        if (fromUnit !== 'any' && toUnit !== 'any' && fromUnit !== 'same' && toUnit !== 'same') {
          if (typeof fromUnit === 'object' && typeof toUnit === 'object') {
            if (fromUnit.kind === 'var' || toUnit.kind === 'var') {
              // vars match anything
            } else if (!unitsEqual(fromUnit as UnitType, toUnit as UnitType)) {
              continue;
            }
          }
        }
      }
      // Broadcast adapter: verify cardinality direction (one → many only)
      if (rule.blockType === 'Broadcast') {
        const fromCard = from.extent.cardinality;
        const toCard = to.extent.cardinality;
        const fromIsOne = fromCard.kind === 'inst' && fromCard.value.kind === 'one';
        const toIsMany = toCard.kind === 'inst' && toCard.value.kind === 'many';
        if (!fromIsOne || !toIsMany) {
          continue;
        }
      }

      return rule.spec;
    }
  }

  return null;
}

/**
 * Check if types need an adapter (and one exists).
 */
export function needsAdapter(from: InferenceCanonicalType, to: InferenceCanonicalType): boolean {
  const fromPattern = extractPattern(from);
  const toPattern = extractPattern(to);

  return !patternsAreCompatible(fromPattern, toPattern) && findAdapter(from, to) !== null;
}

/**
 * Get all registered adapter rules (for debugging/UI).
 * Returns adapter specs with their associated block types.
 */
export function getAllAdapterRules(): readonly { from: TypePattern; to: TypePattern; adapter: AdapterSpec }[] {
  const rules = getAdapterRules();
  return rules.map(r => ({
    from: r.from,
    to: r.to,
    adapter: r.spec,
  }));
}
