/**
 * Lens Utilities for Editor UI
 *
 * Provides helper functions for lens management in the editor.
 */

import type { InferenceCanonicalType, InferenceUnitType } from '../../core/inference-types';
import { getBlockTypesByCategory } from '../../blocks/registry';

/**
 * Information about an available lens type for UI display.
 */
export interface LensTypeInfo {
  /** Block type identifier */
  blockType: string;
  /** Human-readable label */
  label: string;
  /** Description of what the lens does */
  description: string;
  /** Input type the lens accepts */
  inputType: InferenceCanonicalType;
  /** Output type the lens produces */
  outputType: InferenceCanonicalType;
}

/**
 * Get all available lens types for UI selection.
 * Includes both adapter blocks (type converters) and lens blocks (value shapers).
 *
 * @returns Array of lens type info, sorted by label
 */
export function getAvailableLensTypes(): LensTypeInfo[] {
  const adapterBlocks = getBlockTypesByCategory('adapter');
  const lensBlocks = getBlockTypesByCategory('lens');
  const allBlocks = [...adapterBlocks, ...lensBlocks];

  return allBlocks
    .map(def => ({
      blockType: def.type,
      label: def.label,
      description: def.description ?? '',
      inputType: def.inputs['in']?.type,
      outputType: def.outputs['out']?.type,
    }))
    .filter((info): info is LensTypeInfo => !!info.inputType && !!info.outputType) // Only include valid lenses
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Get a human-readable label for a lens type.
 *
 * @param lensType - Block type identifier
 * @returns Human-readable label
 */
export function getLensLabel(lensType: string): string {
  const lenses = getAvailableLensTypes();
  const lens = lenses.find(l => l.blockType === lensType);
  return lens?.label ?? lensType.replace('Adapter_', '').replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Check if a lens can be applied between two types.
 *
 * @param sourceType - Output type from source port
 * @param lensInputType - Input type the lens accepts
 * @param lensOutputType - Output type the lens produces
 * @param targetType - Input type of target port
 * @returns true if lens is compatible
 */
export function canApplyLens(
  sourceType: InferenceCanonicalType,
  lensInputType: InferenceCanonicalType,
  lensOutputType: InferenceCanonicalType,
  targetType: InferenceCanonicalType
): boolean {
  // Simple compatibility: exact type matches
  // Source must match lens input, lens output must match target
  const sourceMatches = typesMatch(sourceType, lensInputType);
  const outputMatches = typesMatch(lensOutputType, targetType);
  return sourceMatches && outputMatches;
}

/**
 * Check if two signal types match.
 * Handles payload and unit comparison with full structural equality.
 */
function typesMatch(a: InferenceCanonicalType, b: InferenceCanonicalType): boolean {
  // Payload must match
  if (a.payload.kind !== b.payload.kind) return false;

  // Unit comparison - must be structurally equal
  const aUnit = a.unit;
  const bUnit = b.unit;

  // If both have no unit, match
  if (!aUnit && !bUnit) return true;

  // If one has unit and other doesn't, no match
  if (!aUnit || !bUnit) return false;

  // Both have units - check structural equality
  return unitsEqualInference(aUnit, bUnit);
}

/**
 * Check if two inference unit types are equal.
 * Handles both concrete units and unit variables.
 */
function unitsEqualInference(a: InferenceUnitType, b: InferenceUnitType): boolean {
  // Handle unit variables
  if (a.kind === 'var' || b.kind === 'var') {
    // Variables only match if same id
    if (a.kind === 'var' && b.kind === 'var') {
      return a.id === b.id;
    }
    return false;
  }

  // Both are concrete units - structural comparison
  if (a.kind !== b.kind) return false;

  // For units with nested fields, check them
  switch (a.kind) {
    case 'angle':
      return (b as Extract<InferenceUnitType, { kind: 'angle' }>).unit === a.unit;
    case 'time':
      return (b as Extract<InferenceUnitType, { kind: 'time' }>).unit === a.unit;
    case 'space': {
      const bSpace = b as Extract<InferenceUnitType, { kind: 'space' }>;
      return bSpace.unit === a.unit && bSpace.dims === a.dims;
    }
    case 'color':
      return (b as Extract<InferenceUnitType, { kind: 'color' }>).unit === a.unit;
    case 'none':
    case 'count':
      return true; // Kind match is sufficient for simple units
    default:
      // Exhaustiveness check
      const _exhaustive: never = a;
      return false;
  }
}

/**
 * Find compatible lenses for a connection.
 *
 * @param sourceType - Output type from source port
 * @param targetType - Input type of target port
 * @returns Array of compatible lens types
 */
export function findCompatibleLenses(
  sourceType: InferenceCanonicalType,
  targetType: InferenceCanonicalType
): LensTypeInfo[] {
  const allLenses = getAvailableLensTypes();
  return allLenses.filter(lens =>
    canApplyLens(sourceType, lens.inputType, lens.outputType, targetType)
  );
}
