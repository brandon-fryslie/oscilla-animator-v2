/**
 * Tests for Type System → IR Bridge Functions
 *
 * These tests verify that all canonical type system variants
 * map correctly to IR schema format using ResolvedExtent.
 */

import { describe, it, expect } from 'vitest';
import {
  bridgeExtentToAxesDescIR,
  bridgeCardinalityToIR,
  bridgeTemporalityToIR,
  bridgePerspectiveToIR,
  bridgeBranchToIR,
  bridgeBindingToIdentityIR,
  payloadTypeToShapeDescIR,
} from '../bridges';
import type {
  Cardinality,
  Temporality,
  Binding,
  Extent,
  SignalType,
  PayloadType,
} from '../../../core/canonical-types';
import {
  axisInstantiated,
  axisDefault,
  cardinalityZero,
  cardinalityOne,
  cardinalityMany,
  temporalityContinuous,
  temporalityDiscrete,
  bindingUnbound,
  bindingWeak,
  bindingStrong,
  bindingIdentity,
  instanceRef,
  referentRef,
  FLOAT,
  INT,
  VEC2,
  COLOR,
  BOOL,
  SHAPE,
} from '../../../core/canonical-types';

// =============================================================================
// Cardinality → Domain Axis
// =============================================================================

describe('bridgeCardinalityToIR', () => {
  it('maps zero cardinality to "value" domain', () => {
    const card: Cardinality = cardinalityZero();
    expect(bridgeCardinalityToIR(card)).toBe('value');
  });

  it('maps one cardinality to "signal" domain', () => {
    const card: Cardinality = cardinalityOne();
    expect(bridgeCardinalityToIR(card)).toBe('signal');
  });

  it('maps many cardinality to "field" domain', () => {
    const card: Cardinality = cardinalityMany(instanceRef('circle', 'particles'));
    expect(bridgeCardinalityToIR(card)).toBe('field');
  });
});

// =============================================================================
// Temporality → Temporality Axis
// =============================================================================

describe('bridgeTemporalityToIR', () => {
  it('maps continuous temporality to "continuous"', () => {
    const temp: Temporality = temporalityContinuous();
    expect(bridgeTemporalityToIR(temp)).toBe('continuous');
  });

  it('maps discrete temporality to "discrete"', () => {
    const temp: Temporality = temporalityDiscrete();
    expect(bridgeTemporalityToIR(temp)).toBe('discrete');
  });
});

// =============================================================================
// Perspective → Perspective Axis
// =============================================================================

describe('bridgePerspectiveToIR', () => {
  it('maps global perspective to "global"', () => {
    expect(bridgePerspectiveToIR('global')).toBe('global');
  });

  it('maps frame perspective to "global" (v0 canonicalization)', () => {
    expect(bridgePerspectiveToIR('frame')).toBe('global');
  });

  it('maps sample perspective to "global" (v0 canonicalization)', () => {
    expect(bridgePerspectiveToIR('sample')).toBe('global');
  });
});

// =============================================================================
// Branch → Branch Axis
// =============================================================================

describe('bridgeBranchToIR', () => {
  it('maps main branch to "single" (v0 canonicalization)', () => {
    expect(bridgeBranchToIR('main')).toBe('single');
  });

  it('maps any branch to "single" (v0 canonicalization)', () => {
    expect(bridgeBranchToIR('branched')).toBe('single');
  });
});

// =============================================================================
// Binding → Identity Axis
// =============================================================================

describe('bridgeBindingToIdentityIR', () => {
  it('maps unbound binding to identity.none', () => {
    const binding: Binding = bindingUnbound();
    const result = bridgeBindingToIdentityIR(binding);
    expect(result).toEqual({ kind: 'none' });
  });

  it('maps identity binding to keyed entity', () => {
    const binding: Binding = bindingIdentity(referentRef('entities'));
    const result = bridgeBindingToIdentityIR(binding);
    expect(result).toEqual({
      kind: 'keyed',
      keySpace: 'entity',
    });
  });

  it('maps weak binding to keyed custom', () => {
    const binding: Binding = bindingWeak(referentRef('mask'));
    const result = bridgeBindingToIdentityIR(binding);
    expect(result).toEqual({
      kind: 'keyed',
      keySpace: 'custom',
    });
  });

  it('maps strong binding to keyed custom', () => {
    const binding: Binding = bindingStrong(referentRef('mask'));
    const result = bridgeBindingToIdentityIR(binding);
    expect(result).toEqual({
      kind: 'keyed',
      keySpace: 'custom',
    });
  });
});

// =============================================================================
// PayloadType → ShapeDescIR
// =============================================================================

describe('payloadTypeToShapeDescIR', () => {
  it('maps float to number shape', () => {
    expect(payloadTypeToShapeDescIR(FLOAT)).toEqual({ kind: 'number' });
  });

  it('maps int to number shape', () => {
    expect(payloadTypeToShapeDescIR(INT)).toEqual({ kind: 'number' });
  });

  it('maps shape to shape kind', () => {
    expect(payloadTypeToShapeDescIR(SHAPE)).toEqual({ kind: 'shape' });
  });

  it('maps bool to bool shape', () => {
    expect(payloadTypeToShapeDescIR(BOOL)).toEqual({ kind: 'bool' });
  });

  it('maps vec2 to vec shape with 2 lanes', () => {
    expect(payloadTypeToShapeDescIR(VEC2)).toEqual({
      kind: 'vec',
      lanes: 2,
      element: 'number',
    });
  });

  it('maps color to vec shape with 4 lanes (RGBA)', () => {
    expect(payloadTypeToShapeDescIR(COLOR)).toEqual({
      kind: 'vec',
      lanes: 4,
      element: 'number',
    });
  });
});

// =============================================================================
// Complete Extent → ResolvedExtent
// =============================================================================

describe('bridgeExtentToAxesDescIR', () => {
  it('bridges signal extent (one + continuous)', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityOne()),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const resolved = bridgeExtentToAxesDescIR(extent);

    expect(resolved.cardinality).toEqual({ kind: 'one' });
    expect(resolved.temporality).toEqual({ kind: 'continuous' });
    expect(resolved.binding).toEqual({ kind: 'unbound' });
    expect(resolved.perspective).toBe('global');
    expect(resolved.branch).toBe('main');
  });

  it('bridges field extent (many + continuous)', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityMany(instanceRef('circle', 'particles'))),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const resolved = bridgeExtentToAxesDescIR(extent);

    expect(resolved.cardinality).toEqual({
      kind: 'many',
      instance: { kind: 'instance', domainType: 'circle', instanceId: 'particles' },
    });
    expect(resolved.temporality).toEqual({ kind: 'continuous' });
    expect(resolved.binding).toEqual({ kind: 'unbound' });
    expect(resolved.perspective).toBe('global');
    expect(resolved.branch).toBe('main');
  });

  it('bridges event extent (one + discrete)', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityOne()),
      temporality: axisInstantiated(temporalityDiscrete()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const resolved = bridgeExtentToAxesDescIR(extent);

    expect(resolved.cardinality).toEqual({ kind: 'one' });
    expect(resolved.temporality).toEqual({ kind: 'discrete' });
    expect(resolved.binding).toEqual({ kind: 'unbound' });
    expect(resolved.perspective).toBe('global');
    expect(resolved.branch).toBe('main');
  });

  it('bridges value extent (zero + continuous)', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityZero()),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const resolved = bridgeExtentToAxesDescIR(extent);

    expect(resolved.cardinality).toEqual({ kind: 'zero' });
    expect(resolved.temporality).toEqual({ kind: 'continuous' });
    expect(resolved.binding).toEqual({ kind: 'unbound' });
    expect(resolved.perspective).toBe('global');
    expect(resolved.branch).toBe('main');
  });

  it('throws error when cardinality is default', () => {
    const extent: Extent = {
      cardinality: axisDefault(),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    expect(() => bridgeExtentToAxesDescIR(extent)).toThrow(
      /Cannot bridge axis 'cardinality' with kind 'default'/
    );
  });

  it('throws error when temporality is default', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityOne()),
      temporality: axisDefault(),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    expect(() => bridgeExtentToAxesDescIR(extent)).toThrow(
      /Cannot bridge axis 'temporality' with kind 'default'/
    );
  });

  it('preserves identity binding through bridging', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityMany(instanceRef('circle', 'particles'))),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingIdentity(referentRef('entities'))),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const resolved = bridgeExtentToAxesDescIR(extent);

    expect(resolved.binding).toEqual({
      kind: 'identity',
      referent: { kind: 'referent', id: 'entities' },
    });
  });
});

// =============================================================================
// Edge Cases and Combinations
// =============================================================================

describe('bridging edge cases', () => {
  it('handles all cardinality × temporality combinations', () => {
    const cardinalities: Cardinality[] = [
      cardinalityZero(),
      cardinalityOne(),
      cardinalityMany(instanceRef('circle', 'test')),
    ];
    const temporalities: Temporality[] = [
      temporalityContinuous(),
      temporalityDiscrete(),
    ];

    // All combinations should bridge without error
    for (const card of cardinalities) {
      for (const temp of temporalities) {
        const extent: Extent = {
          cardinality: axisInstantiated(card),
          temporality: axisInstantiated(temp),
          binding: axisInstantiated(bindingUnbound()),
          perspective: axisInstantiated('global'),
          branch: axisInstantiated('main'),
        };

        expect(() => bridgeExtentToAxesDescIR(extent)).not.toThrow();
      }
    }
  });

  it('handles all payload types', () => {
    const payloads: PayloadType[] = [
      FLOAT,
      INT,
      VEC2,
      COLOR,
      BOOL,
      SHAPE,
    ];

    for (const payload of payloads) {
      expect(() => payloadTypeToShapeDescIR(payload)).not.toThrow();
    }
  });

  it('handles all binding variants', () => {
    const bindings: Binding[] = [
      bindingUnbound(),
      bindingWeak(referentRef('test')),
      bindingStrong(referentRef('test')),
      bindingIdentity(referentRef('test')),
    ];

    for (const binding of bindings) {
      expect(() => bridgeBindingToIdentityIR(binding)).not.toThrow();
    }
  });
});
