/**
 * Bridge Functions - Convert Canonical Types to IR Types
 *
 * These functions convert from the canonical SignalType (payload + extent)
 * to the CompiledProgramIR TypeDesc (resolved extent + shape) format.
 *
 * This is the ONLY place where this conversion happens.
 * Runtime never performs this conversion.
 */

import type {
  SignalType,
  PayloadType,
  Extent,
  ResolvedExtent,
} from '../../core/canonical-types';
import { resolveExtent } from '../../core/canonical-types';
import type { ShapeDescIR, TypeDesc } from './program';

// =============================================================================
// Bridge: Extent → ResolvedExtent
// =============================================================================

/**
 * Convert Extent to ResolvedExtent.
 *
 * This resolves all AxisTag.default values using v0 canonical defaults.
 * After this conversion, all axes are fully instantiated.
 *
 * This is simply a re-export of resolveExtent from canonical-types.
 * We keep this alias for backwards compatibility with existing bridge code.
 */
export function extentToResolvedExtent(extent: Extent): ResolvedExtent {
  return resolveExtent(extent);
}

// =============================================================================
// Bridge: PayloadType → ShapeDescIR
// =============================================================================

/**
 * Convert PayloadType to ShapeDescIR.
 *
 * This maps semantic types (float, vec2, color, etc.) to shape descriptors.
 */
export function payloadTypeToShapeDescIR(payload: PayloadType): ShapeDescIR {
  switch (payload) {
    case 'float':
      return { kind: 'number' };
    case 'int':
      return { kind: 'number' }; // Storage class handles precision
    case 'bool':
      return { kind: 'bool' };
    case 'vec2':
      return { kind: 'vec', lanes: 2, element: 'number' };
    case 'color':
      // Color is RGBA (4 components)
      return { kind: 'vec', lanes: 4, element: 'number' };
    case 'phase':
      // Phase is a wrapped float [0, 1)
      return { kind: 'number' };
    case 'unit':
      // Unit is [0, 1] float
      return { kind: 'number' };
  }
}

// =============================================================================
// Bridge: SignalType → TypeDesc
// =============================================================================

/**
 * Convert SignalType to TypeDesc.
 *
 * This is the top-level bridge function that combines axes and shape.
 */
export function signalTypeToTypeDesc(signalType: SignalType): TypeDesc {
  return {
    axes: resolveExtent(signalType.extent),
    shape: payloadTypeToShapeDescIR(signalType.payload),
  };
}

// =============================================================================
// Helpers for Special Cases
// =============================================================================

/**
 * Create resolved extent for a value (compile-time constant).
 * - cardinality: zero
 * - temporality: continuous
 * - binding: unbound
 * - perspective: global
 * - branch: main
 */
export function axesForValue(): ResolvedExtent {
  return {
    cardinality: { kind: 'zero' },
    temporality: { kind: 'continuous' },
    binding: { kind: 'unbound' },
    perspective: 'global',
    branch: 'main',
  };
}

/**
 * Create resolved extent for a signal (single time-indexed lane).
 * - cardinality: one
 * - temporality: continuous
 * - binding: unbound
 * - perspective: global
 * - branch: main
 */
export function axesForSignal(): ResolvedExtent {
  return {
    cardinality: { kind: 'one' },
    temporality: { kind: 'continuous' },
    binding: { kind: 'unbound' },
    perspective: 'global',
    branch: 'main',
  };
}

/**
 * Create resolved extent for a field (spatially-indexed lanes).
 * - cardinality: many (domain will need to be filled in)
 * - temporality: continuous
 * - binding: unbound
 * - perspective: global
 * - branch: main
 *
 * Note: This returns a placeholder. Callers must fill in the domain.
 */
export function axesForField(): ResolvedExtent {
  return {
    cardinality: { kind: 'many', domain: { kind: 'domain', id: '__placeholder__' } },
    temporality: { kind: 'continuous' },
    binding: { kind: 'unbound' },
    perspective: 'global',
    branch: 'main',
  };
}

/**
 * Create resolved extent for an event (discrete occurrences).
 * - cardinality: one
 * - temporality: discrete
 * - binding: unbound
 * - perspective: global
 * - branch: main
 */
export function axesForEvent(): ResolvedExtent {
  return {
    cardinality: { kind: 'one' },
    temporality: { kind: 'discrete' },
    binding: { kind: 'unbound' },
    perspective: 'global',
    branch: 'main',
  };
}
