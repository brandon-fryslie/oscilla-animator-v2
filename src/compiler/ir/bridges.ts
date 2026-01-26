/**
 * Bridge Functions: Canonical Type System → IR Schema
 *
 * These pure functions translate from the canonical type system
 * (SignalType with 5-axis Extent) to individual axis/shape components.
 *
 * Design principles:
 * - Pure functions (no side effects)
 * - Handle ALL variants exhaustively
 * - Fail fast on invalid input
 * - Map according to spec semantics
 *
 * Note: This module provides granular bridge functions for testing.
 * Production code should use bridge.ts which wraps these.
 */

import type {
  SignalType,
  Extent,
  Cardinality,
  Temporality,
  Binding,
  AxisTag,
  PayloadType,
  ConcretePayloadType,
  ResolvedExtent,
} from '../../core/canonical-types';
import { isInstantiated, isPayloadVar, FLOAT, INT, VEC2, VEC3, COLOR, BOOL, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';
import type { ShapeDescIR } from './program';

// =============================================================================
// Main Bridge Function: Extent → ResolvedExtent
// =============================================================================

/**
 * Bridge a complete Extent to ResolvedExtent.
 *
 * This is the primary entry point for type system → IR conversion.
 * It requires that all axes are instantiated (not default).
 * Pass 4 (resolve defaults) must run before calling this.
 *
 * @throws Error if any axis is still 'default'
 */
export function bridgeExtentToAxesDescIR(extent: Extent): ResolvedExtent {
  // Extract instantiated values or throw
  const cardinality = getInstantiatedOrThrow(
    extent.cardinality,
    'cardinality'
  );
  const temporality = getInstantiatedOrThrow(
    extent.temporality,
    'temporality'
  );
  const binding = getInstantiatedOrThrow(extent.binding, 'binding');
  const perspective = getInstantiatedOrThrow(extent.perspective, 'perspective');
  const branch = getInstantiatedOrThrow(extent.branch, 'branch');

  // Return resolved extent with canonical types
  return {
    cardinality,
    temporality,
    binding,
    perspective,
    branch,
  };
}

// =============================================================================
// Axis-Specific Bridge Functions (for testing)
// =============================================================================

/**
 * Bridge Cardinality to IR domain classification string.
 *
 * This is a test helper that maps cardinality to the old "domain" vocabulary.
 * Production code should use the cardinality directly.
 *
 * Mapping:
 * - zero → "value" (compile-time constant, not world-resident)
 * - one → "signal" (single-lane time-varying value)
 * - many(domain) → "field" (multi-lane spatially-indexed value)
 */
export function bridgeCardinalityToIR(
  cardinality: Cardinality
): 'signal' | 'field' | 'value' {
  switch (cardinality.kind) {
    case 'zero':
      return 'value';
    case 'one':
      return 'signal';
    case 'many':
      return 'field';
    default:
      exhaustiveCheck(cardinality);
  }
}

/**
 * Bridge Temporality to IR temporality string.
 *
 * Mapping is direct (same vocabulary):
 * - continuous → "continuous"
 * - discrete → "discrete"
 */
export function bridgeTemporalityToIR(
  temporality: Temporality
): 'continuous' | 'discrete' {
  switch (temporality.kind) {
    case 'continuous':
      return 'continuous';
    case 'discrete':
      return 'discrete';
    default:
      exhaustiveCheck(temporality);
  }
}

/**
 * Bridge Perspective to IR perspective string.
 *
 * For v0, we canonicalize all perspectives to 'global'.
 * Future versions will preserve 'frame' and 'sample' distinctions.
 */
export function bridgePerspectiveToIR(
  perspective: string
): 'frame' | 'sample' | 'global' {
  // V0: all perspectives map to 'global'
  // This is intentionally simplified for initial implementation
  return 'global';
}

/**
 * Bridge Branch to IR branch string.
 *
 * For v0, we canonicalize all branches to 'single'.
 * Branch semantics are deferred to Phase 2.
 */
export function bridgeBranchToIR(_branch: string): 'single' | 'branched' {
  // V0: all branches map to 'single'
  // This is intentionally simplified for initial implementation
  return 'single';
}

/**
 * Bridge Binding to IR identity axis.
 *
 * Mapping:
 * - unbound → { kind: 'none' }
 * - weak/strong/identity → { kind: 'keyed', keySpace: <derived> }
 *
 * KeySpace derivation:
 * - identity binding → 'entity'
 * - strong/weak binding → 'custom' (for v0)
 */
export function bridgeBindingToIdentityIR(
  binding: Binding
):
  | { readonly kind: 'none' }
  | {
      readonly kind: 'keyed';
      readonly keySpace: 'entity' | 'point' | 'pixel' | 'custom';
      readonly keyTag?: string;
    } {
  switch (binding.kind) {
    case 'unbound':
      return { kind: 'none' };

    case 'identity':
      // Identity bindings use 'entity' keyspace
      return { kind: 'keyed', keySpace: 'entity' };

    case 'weak':
    case 'strong':
      // V0: map to 'custom' keyspace
      // Future: use referent metadata to determine keyspace
      return { kind: 'keyed', keySpace: 'custom' };

    default:
      exhaustiveCheck(binding);
  }
}

// =============================================================================
// PayloadType → ShapeDescIR
// =============================================================================

/**
 * Bridge PayloadType to IR shape descriptor.
 *
 * Mapping:
 * - float → { kind: 'number' }
 * - int → { kind: 'number' }
 * - vec2 → { kind: 'vec', lanes: 2, element: 'number' }
 * - color → { kind: 'vec', lanes: 4, element: 'number' } (RGBA)
 * - bool → { kind: 'bool' }
 *
 * Note: 'phase' and 'unit' are NOT PayloadTypes - they are float with units.
 * Note: Physical storage class is determined separately by SlotMetaEntry.storage
 * Note: Payload variables must be resolved before calling this function.
 */
export function payloadTypeToShapeDescIR(payload: PayloadType): ShapeDescIR {
  // Payload variables must be resolved before this point
  if (isPayloadVar(payload)) {
    throw new Error(`Cannot convert payload variable ${payload.id} to shape descriptor - resolve payload first`);
  }

  // After the guard, payload is a concrete type (not a variable)
  const concretePayload = payload as ConcretePayloadType;
  switch (concretePayload.kind) {
    case 'float':
    case 'int':
      return { kind: 'number' };

    case 'vec2':
      return { kind: 'vec', lanes: 2, element: 'number' };
    case 'vec3':
      return { kind: 'vec', lanes: 3, element: 'number' };


    case 'color':
      // Color is RGBA (4 lanes)
      return { kind: 'vec', lanes: 4, element: 'number' };

    case 'bool':
      return { kind: 'bool' };

    case 'shape':
      return { kind: 'shape' };

    case 'cameraProjection':
      // cameraProjection is a scalar enum stored as number (0=ortho, 1=persp)
      return { kind: 'number' };

    default:
      exhaustiveCheck(concretePayload);
  }
}


// =============================================================================
// Utilities
// =============================================================================

/**
 * Extract instantiated value from AxisTag or throw.
 */
function getInstantiatedOrThrow<T>(tag: AxisTag<T>, axisName: string): T {
  if (!isInstantiated(tag)) {
    throw new Error(
      `Cannot bridge axis '${axisName}' with kind 'default'. ` +
        `All axes must be instantiated before bridging to IR. ` +
        `Run Pass 4 (resolve defaults) first.`
    );
  }
  return tag.value;
}

/**
 * Exhaustiveness check for discriminated unions.
 * TypeScript will error if a case is missing.
 */
function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
