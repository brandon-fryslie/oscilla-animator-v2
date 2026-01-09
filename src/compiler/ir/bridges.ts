/**
 * Bridge Functions: Canonical Type System → IR Schema
 *
 * These pure functions translate from the canonical type system
 * (SignalType with 5-axis Extent) to the IR schema format (AxesDescIR).
 *
 * Design principles:
 * - Pure functions (no side effects)
 * - Handle ALL variants exhaustively
 * - Fail fast on invalid input
 * - Map according to spec semantics
 */

import type {
  SignalType,
  Extent,
  Cardinality,
  Temporality,
  Binding,
  AxisTag,
  PayloadType,
} from '../../core/canonical-types';
import type { AxesDescIR, ShapeDescIR } from './program';
import { isInstantiated } from '../../core/canonical-types';

// =============================================================================
// Main Bridge Function: Extent → AxesDescIR
// =============================================================================

/**
 * Bridge a complete Extent to AxesDescIR.
 *
 * This is the primary entry point for type system → IR conversion.
 * It requires that all axes are instantiated (not default).
 * Pass 4 (resolve defaults) must run before calling this.
 *
 * @throws Error if any axis is still 'default'
 */
export function bridgeExtentToAxesDescIR(extent: Extent): AxesDescIR {
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

  // Map each axis independently
  return {
    domain: bridgeCardinalityToIR(cardinality),
    temporality: bridgeTemporalityToIR(temporality),
    perspective: bridgePerspectiveToIR(perspective),
    branch: bridgeBranchToIR(branch),
    identity: bridgeBindingToIdentityIR(binding),
  };
}

// =============================================================================
// Axis-Specific Bridge Functions
// =============================================================================

/**
 * Bridge Cardinality to IR domain axis.
 *
 * Mapping:
 * - zero → "value" (compile-time constant, not world-resident)
 * - one → "signal" (single-lane time-varying value)
 * - many(domain) → "field" (multi-lane spatially-indexed value)
 */
export function bridgeCardinalityToIR(
  cardinality: Cardinality
): AxesDescIR['domain'] {
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
 * Bridge Temporality to IR temporality axis.
 *
 * Mapping is direct (same vocabulary):
 * - continuous → "continuous"
 * - discrete → "discrete"
 *
 * Note: IR also supports "static" and "instant" which will be added
 * when the canonical type system expands.
 */
export function bridgeTemporalityToIR(
  temporality: Temporality
): AxesDescIR['temporality'] {
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
 * Bridge Perspective to IR perspective axis.
 *
 * For v0, we canonicalize all perspectives to 'global'.
 * Future versions will preserve 'frame' and 'sample' distinctions.
 */
export function bridgePerspectiveToIR(
  perspective: string
): AxesDescIR['perspective'] {
  // V0: all perspectives map to 'global'
  // This is intentionally simplified for initial implementation
  return 'global';
}

/**
 * Bridge Branch to IR branch axis.
 *
 * For v0, we canonicalize all branches to 'single'.
 * Branch semantics are deferred to Phase 2.
 */
export function bridgeBranchToIR(branch: string): AxesDescIR['branch'] {
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
): AxesDescIR['identity'] {
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
 * - phase → { kind: 'number' } (specialized number with wrap semantics)
 * - bool → { kind: 'bool' }
 * - unit → { kind: 'number' } (unit interval [0,1])
 *
 * Note: Physical storage class is determined separately by SlotMetaEntry.storage
 */
export function payloadTypeToShapeDescIR(payload: PayloadType): ShapeDescIR {
  switch (payload) {
    case 'float':
    case 'int':
    case 'phase':
    case 'unit':
      return { kind: 'number' };

    case 'vec2':
      return { kind: 'vec', lanes: 2, element: 'number' };

    case 'color':
      // Color is RGBA (4 lanes)
      return { kind: 'vec', lanes: 4, element: 'number' };

    case 'bool':
      return { kind: 'bool' };

    default:
      exhaustiveCheck(payload);
  }
}

/**
 * Complete SignalType → IR TypeDesc conversion.
 *
 * This combines payload and extent bridging.
 * Requires all extent axes to be instantiated.
 */
export function signalTypeToTypeDescIR(
  type: SignalType
): { axes: AxesDescIR; shape: ShapeDescIR } {
  return {
    axes: bridgeExtentToAxesDescIR(type.extent),
    shape: payloadTypeToShapeDescIR(type.payload),
  };
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
