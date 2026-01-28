/**
 * Lens Utilities for Editor UI
 *
 * Provides helper functions for lens management in the editor.
 */

import type { SignalType } from '../../core/canonical-types';
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
  inputType: SignalType;
  /** Output type the lens produces */
  outputType: SignalType;
}

/**
 * Get all available lens types for UI selection.
 * Filters adapter blocks from the registry.
 *
 * @returns Array of lens type info, sorted by label
 */
export function getAvailableLensTypes(): LensTypeInfo[] {
  const adapterBlocks = getBlockTypesByCategory('adapter');

  return adapterBlocks
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
  sourceType: SignalType,
  lensInputType: SignalType,
  lensOutputType: SignalType,
  targetType: SignalType
): boolean {
  // Simple compatibility: exact type matches
  // Source must match lens input, lens output must match target
  const sourceMatches = typesMatch(sourceType, lensInputType);
  const outputMatches = typesMatch(lensOutputType, targetType);
  return sourceMatches && outputMatches;
}

/**
 * Check if two signal types match.
 * Handles payload and unit comparison.
 */
function typesMatch(a: SignalType, b: SignalType): boolean {
  // Payload must match
  if (a.payload.kind !== b.payload.kind) return false;

  // Unit comparison (if both have units)
  if (a.unit && b.unit) {
    return a.unit.kind === b.unit.kind;
  }

  // If either has no unit, consider compatible (scalar)
  return true;
}

/**
 * Find compatible lenses for a connection.
 *
 * @param sourceType - Output type from source port
 * @param targetType - Input type of target port
 * @returns Array of compatible lens types
 */
export function findCompatibleLenses(
  sourceType: SignalType,
  targetType: SignalType
): LensTypeInfo[] {
  const allLenses = getAvailableLensTypes();
  
  console.log('[Lens Debug] Finding lenses for:', {
    source: sourceType,
    target: targetType,
    availableLenses: allLenses.length,
  });
  
  const compatible = allLenses.filter(lens => {
    const canApply = canApplyLens(sourceType, lens.inputType, lens.outputType, targetType);
    console.log('[Lens Debug] Checking lens:', {
      lens: lens.label,
      lensInput: lens.inputType,
      lensOutput: lens.outputType,
      canApply,
    });
    return canApply;
  });
  
  console.log('[Lens Debug] Compatible lenses found:', compatible.length);
  return compatible;
}
