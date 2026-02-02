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

import type { UnitType, Extent, ValueContract } from '../core/canonical-types';
import type { InferenceCanonicalType, InferencePayloadType, InferenceUnitType } from '../core/inference-types';
import { unitsEqual, extentsEqual, contractsEqual } from '../core/canonical-types';
import { requireInst } from '../core/canonical-types/axis';
import {
  cardinalitiesEqual,
  temporalitiesEqual,
  bindingsEqual,
  perspectivesEqual,
  branchesEqual,
} from '../core/canonical-types/equality';
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
 *
 * Contract field is optional:
 * - undefined: don't care about contract (matches any contract, backward compatible)
 * - ValueContract: match specific contract
 * - 'same': output contract matches input contract
 * - 'any': matches any contract (explicit wildcard)
 */
export interface TypePattern {
  readonly payload: InferencePayloadType | 'same' | 'any';
  readonly unit: InferenceUnitType | 'same' | 'any';
  readonly extent: ExtentPattern;
  readonly contract?: ValueContract | 'same' | 'any';
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
    contract: type.contract,
  };
}

/**
 * Check if an extent matches a pattern.
 * Uses per-axis structural equality for each specified axis in the pattern.
 */
function extentMatches(actual: Extent, pattern: ExtentPattern): boolean {
  if (pattern === 'any') return true;

  if (pattern.cardinality) {
    const a = requireInst(actual.cardinality, 'cardinality');
    const b = requireInst(pattern.cardinality, 'cardinality');
    if (!cardinalitiesEqual(a, b)) return false;
  }
  if (pattern.temporality) {
    const a = requireInst(actual.temporality, 'temporality');
    const b = requireInst(pattern.temporality, 'temporality');
    if (!temporalitiesEqual(a, b)) return false;
  }
  if (pattern.binding) {
    const a = requireInst(actual.binding, 'binding');
    const b = requireInst(pattern.binding, 'binding');
    if (!bindingsEqual(a, b)) return false;
  }
  if (pattern.perspective) {
    const a = requireInst(actual.perspective, 'perspective');
    const b = requireInst(pattern.perspective, 'perspective');
    if (!perspectivesEqual(a, b)) return false;
  }
  if (pattern.branch) {
    const a = requireInst(actual.branch, 'branch');
    const b = requireInst(pattern.branch, 'branch');
    if (!branchesEqual(a, b)) return false;
  }

  return true;
}

/**
 * Check if a contract matches a pattern.
 */
function contractMatches(
  actual: ValueContract | 'same' | 'any' | undefined,
  pattern: ValueContract | 'same' | 'any' | undefined
): boolean {
  // Pattern not specified (undefined)? Always match (backward compat).
  if (pattern === undefined) return true;

  // Pattern is 'any'? Always match.
  if (pattern === 'any') return true;

  // Pattern is 'same'? Always match (caller must handle 'same' logic).
  if (pattern === 'same') return true;

  // Actual is 'any' or 'same'? These are rule patterns, not concrete values.
  // Should not happen in practice when matching actual types, but handle gracefully.
  if (actual === 'any' || actual === 'same') return true;

  // Pattern is specific contract? Must match exactly.
  return contractsEqual(actual as ValueContract | undefined, pattern);
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

  if (!extentMatches(actual.extent as Extent, pattern.extent)) return false;

  // Contract must match
  if (!contractMatches(actual.contract, pattern.contract)) return false;

  return true;
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
  if (!extentsEqual(from.extent as Extent, to.extent as Extent)) return false;

  // Contract must be compatible (treats undefined as 'none')
  const fromContract = from.contract;
  const toContract = to.contract;

  // Handle special pattern values ('same', 'any') - these are only in rule definitions, not actual types
  if (fromContract === 'same' || fromContract === 'any' || toContract === 'same' || toContract === 'any') {
    // If either is a special pattern value, assume compatible (will be checked in detail by rule matching)
    return true;
  }

  const fromKind = typeof fromContract === 'object' ? fromContract.kind : 'none';
  const toKind = typeof toContract === 'object' ? toContract.kind : 'none';

  // Target expects no contract (none)? Always compatible (dropping guarantee is OK).
  if (toKind === 'none') return true;

  // Target expects something specific? Source must provide the same guarantee.
  return fromKind === toKind;
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
      // For rules with 'same' contract, require actual contracts to match
      // Note: extractPattern only returns ValueContract | undefined, never 'same' or 'any'
      if (rule.to.contract === 'same') {
        const fromContract = fromPattern.contract as ValueContract | undefined;
        const toContract = toPattern.contract as ValueContract | undefined;
        if (!contractsEqual(fromContract, toContract)) {
          continue;
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

