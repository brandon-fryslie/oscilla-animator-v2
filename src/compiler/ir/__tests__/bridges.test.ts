/**
 * Tests for Type System → IR Bridge Functions
 *
 * These tests verify that all canonical type system variants
 * map correctly to IR schema format.
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
  signalTypeToTypeDescIR,
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
  domainRef,
  referentRef,
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
    const card: Cardinality = cardinalityMany(domainRef('particles'));
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
    expect(payloadTypeToShapeDescIR('float')).toEqual({ kind: 'number' });
  });

  it('maps int to number shape', () => {
    expect(payloadTypeToShapeDescIR('int')).toEqual({ kind: 'number' });
  });

  it('maps phase to number shape', () => {
    expect(payloadTypeToShapeDescIR('phase')).toEqual({ kind: 'number' });
  });

  it('maps unit to number shape', () => {
    expect(payloadTypeToShapeDescIR('unit')).toEqual({ kind: 'number' });
  });

  it('maps bool to bool shape', () => {
    expect(payloadTypeToShapeDescIR('bool')).toEqual({ kind: 'bool' });
  });

  it('maps vec2 to vec shape with 2 lanes', () => {
    expect(payloadTypeToShapeDescIR('vec2')).toEqual({
      kind: 'vec',
      lanes: 2,
      element: 'number',
    });
  });

  it('maps color to vec shape with 4 lanes (RGBA)', () => {
    expect(payloadTypeToShapeDescIR('color')).toEqual({
      kind: 'vec',
      lanes: 4,
      element: 'number',
    });
  });
});

// =============================================================================
// Complete Extent → AxesDescIR
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

    const axes = bridgeExtentToAxesDescIR(extent);

    expect(axes).toEqual({
      domain: 'signal',
      temporality: 'continuous',
      perspective: 'global',
      branch: 'single',
      identity: { kind: 'none' },
    });
  });

  it('bridges field extent (many + continuous)', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityMany(domainRef('particles'))),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const axes = bridgeExtentToAxesDescIR(extent);

    expect(axes).toEqual({
      domain: 'field',
      temporality: 'continuous',
      perspective: 'global',
      branch: 'single',
      identity: { kind: 'none' },
    });
  });

  it('bridges event extent (one + discrete)', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityOne()),
      temporality: axisInstantiated(temporalityDiscrete()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const axes = bridgeExtentToAxesDescIR(extent);

    expect(axes).toEqual({
      domain: 'signal',
      temporality: 'discrete',
      perspective: 'global',
      branch: 'single',
      identity: { kind: 'none' },
    });
  });

  it('bridges value extent (zero + continuous)', () => {
    const extent: Extent = {
      cardinality: axisInstantiated(cardinalityZero()),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingUnbound()),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const axes = bridgeExtentToAxesDescIR(extent);

    expect(axes).toEqual({
      domain: 'value',
      temporality: 'continuous',
      perspective: 'global',
      branch: 'single',
      identity: { kind: 'none' },
    });
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
      cardinality: axisInstantiated(cardinalityMany(domainRef('particles'))),
      temporality: axisInstantiated(temporalityContinuous()),
      binding: axisInstantiated(bindingIdentity(referentRef('entities'))),
      perspective: axisInstantiated('global'),
      branch: axisInstantiated('main'),
    };

    const axes = bridgeExtentToAxesDescIR(extent);

    expect(axes.identity).toEqual({
      kind: 'keyed',
      keySpace: 'entity',
    });
  });
});

// =============================================================================
// Complete SignalType → TypeDesc
// =============================================================================

describe('signalTypeToTypeDescIR', () => {
  it('bridges complete signal type (float signal)', () => {
    const signalType: SignalType = {
      payload: 'float',
      extent: {
        cardinality: axisInstantiated(cardinalityOne()),
        temporality: axisInstantiated(temporalityContinuous()),
        binding: axisInstantiated(bindingUnbound()),
        perspective: axisInstantiated('global'),
        branch: axisInstantiated('main'),
      },
    };

    const typeDesc = signalTypeToTypeDescIR(signalType);

    expect(typeDesc).toEqual({
      axes: {
        domain: 'signal',
        temporality: 'continuous',
        perspective: 'global',
        branch: 'single',
        identity: { kind: 'none' },
      },
      shape: { kind: 'number' },
    });
  });

  it('bridges complete field type (color field)', () => {
    const signalType: SignalType = {
      payload: 'color',
      extent: {
        cardinality: axisInstantiated(
          cardinalityMany(domainRef('particles'))
        ),
        temporality: axisInstantiated(temporalityContinuous()),
        binding: axisInstantiated(bindingUnbound()),
        perspective: axisInstantiated('global'),
        branch: axisInstantiated('main'),
      },
    };

    const typeDesc = signalTypeToTypeDescIR(signalType);

    expect(typeDesc).toEqual({
      axes: {
        domain: 'field',
        temporality: 'continuous',
        perspective: 'global',
        branch: 'single',
        identity: { kind: 'none' },
      },
      shape: { kind: 'vec', lanes: 4, element: 'number' },
    });
  });

  it('bridges vec2 field type', () => {
    const signalType: SignalType = {
      payload: 'vec2',
      extent: {
        cardinality: axisInstantiated(cardinalityMany(domainRef('grid'))),
        temporality: axisInstantiated(temporalityContinuous()),
        binding: axisInstantiated(bindingUnbound()),
        perspective: axisInstantiated('global'),
        branch: axisInstantiated('main'),
      },
    };

    const typeDesc = signalTypeToTypeDescIR(signalType);

    expect(typeDesc.shape).toEqual({
      kind: 'vec',
      lanes: 2,
      element: 'number',
    });
  });

  it('bridges phase signal type', () => {
    const signalType: SignalType = {
      payload: 'phase',
      extent: {
        cardinality: axisInstantiated(cardinalityOne()),
        temporality: axisInstantiated(temporalityContinuous()),
        binding: axisInstantiated(bindingUnbound()),
        perspective: axisInstantiated('global'),
        branch: axisInstantiated('main'),
      },
    };

    const typeDesc = signalTypeToTypeDescIR(signalType);

    expect(typeDesc.axes.domain).toBe('signal');
    expect(typeDesc.shape).toEqual({ kind: 'number' });
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
      cardinalityMany(domainRef('test')),
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
      'float',
      'int',
      'vec2',
      'color',
      'phase',
      'bool',
      'unit',
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
