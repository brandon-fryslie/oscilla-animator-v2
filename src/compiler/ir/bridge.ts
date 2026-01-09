/**
 * Bridge Functions - Convert Canonical Types to IR Types
 *
 * These functions convert from the canonical SignalType (payload + extent)
 * to the CompiledProgramIR TypeDesc (axes + shape) format.
 *
 * This is the ONLY place where this conversion happens.
 * Runtime never performs this conversion.
 */

import type {
  SignalType,
  PayloadType,
  Extent,
  Cardinality,
  Temporality,
  Binding,
  AxisTag,
} from '../../core/canonical-types';
import { getAxisValue, DEFAULTS_V0, FRAME_V0 } from '../../core/canonical-types';
import type { AxesDescIR, ShapeDescIR, TypeDesc } from './program';

// =============================================================================
// Bridge: Extent → AxesDescIR
// =============================================================================

/**
 * Convert Extent to AxesDescIR.
 *
 * This resolves all AxisTag.default values using v0 canonical defaults.
 * After this conversion, all axes are fully instantiated.
 */
export function extentToAxesDescIR(extent: Extent): AxesDescIR {
  // Resolve cardinality
  const cardinality = getAxisValue(extent.cardinality, DEFAULTS_V0.cardinality);

  // Resolve temporality
  const temporality = getAxisValue(extent.temporality, DEFAULTS_V0.temporality);

  // Resolve binding
  const binding = getAxisValue(extent.binding, DEFAULTS_V0.binding);

  // Resolve perspective (v0: always global)
  const perspective = getAxisValue(extent.perspective, DEFAULTS_V0.perspective);

  // Resolve branch (v0: always main)
  const branch = getAxisValue(extent.branch, DEFAULTS_V0.branch);

  // Map cardinality → domain
  const domain = cardinalityToDomain(cardinality);

  // Map temporality → temporality
  const temporalityIR = temporalityToTemporalityIR(temporality);

  // Map perspective → perspective
  const perspectiveIR = perspectiveToIR(perspective);

  // Map branch → branch
  const branchIR = branchToIR(branch);

  // Map binding → identity
  const identity = bindingToIdentity(binding);

  return {
    domain,
    temporality: temporalityIR,
    perspective: perspectiveIR,
    branch: branchIR,
    identity,
  };
}

/**
 * Map Cardinality to domain axis.
 *
 * - zero → "value" (compile-time constant, no runtime lanes)
 * - one → "signal" (single time-indexed lane)
 * - many(domain) → "field" (spatially-indexed lanes)
 */
function cardinalityToDomain(
  cardinality: Cardinality
): 'signal' | 'field' | 'event' | 'value' {
  switch (cardinality.kind) {
    case 'zero':
      return 'value'; // Compile-time constant
    case 'one':
      return 'signal'; // Single time-indexed lane
    case 'many':
      return 'field'; // Spatially-indexed lanes over domain
  }
}

/**
 * Map Temporality to temporality axis.
 *
 * - continuous → "continuous"
 * - discrete → "discrete" (for events)
 *
 * Note: We map to IR temporality. For zero cardinality (value),
 * we use "static" instead of "continuous".
 */
function temporalityToTemporalityIR(
  temporality: Temporality
): 'static' | 'discrete' | 'continuous' | 'instant' {
  switch (temporality.kind) {
    case 'continuous':
      return 'continuous';
    case 'discrete':
      return 'instant'; // Discrete events exist only at instants
  }
}

/**
 * Map perspective ID to IR perspective.
 */
function perspectiveToIR(perspectiveId: string): 'frame' | 'sample' | 'global' {
  // v0: always "global" per FRAME_V0
  if (perspectiveId === 'global') {
    return 'global';
  }
  // For future use: map other perspectives
  return 'frame'; // Default fallback
}

/**
 * Map branch ID to IR branch.
 */
function branchToIR(_branchId: string): 'single' | 'branched' {
  // v0: always "single" (no branch support yet)
  return 'single';
}

/**
 * Map Binding to identity axis.
 *
 * - unbound → { kind: "none" }
 * - weak/strong/identity → { kind: "keyed", keySpace: "entity" }
 */
function bindingToIdentity(
  binding: Binding
): AxesDescIR['identity'] {
  switch (binding.kind) {
    case 'unbound':
      return { kind: 'none' };
    case 'weak':
    case 'strong':
    case 'identity':
      // For v0, map all bound referents to "entity" keyspace
      return {
        kind: 'keyed',
        keySpace: 'entity',
        keyTag: binding.referent.id,
      };
  }
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
    axes: extentToAxesDescIR(signalType.extent),
    shape: payloadTypeToShapeDescIR(signalType.payload),
  };
}

// =============================================================================
// Helpers for Special Cases
// =============================================================================

/**
 * Create axes for a value domain (compile-time constant).
 */
export function axesForValue(): AxesDescIR {
  return {
    domain: 'value',
    temporality: 'static',
    perspective: 'global',
    branch: 'single',
    identity: { kind: 'none' },
  };
}

/**
 * Create axes for a signal domain (single time-indexed lane).
 */
export function axesForSignal(): AxesDescIR {
  return {
    domain: 'signal',
    temporality: 'continuous',
    perspective: 'global',
    branch: 'single',
    identity: { kind: 'none' },
  };
}

/**
 * Create axes for a field domain (spatially-indexed lanes).
 */
export function axesForField(): AxesDescIR {
  return {
    domain: 'field',
    temporality: 'continuous',
    perspective: 'global',
    branch: 'single',
    identity: { kind: 'none' },
  };
}

/**
 * Create axes for an event domain (discrete occurrences).
 */
export function axesForEvent(): AxesDescIR {
  return {
    domain: 'event',
    temporality: 'instant',
    perspective: 'global',
    branch: 'single',
    identity: { kind: 'none' },
  };
}
