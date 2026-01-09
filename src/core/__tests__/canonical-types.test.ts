/**
 * Canonical Type System Tests
 *
 * Tests for the 5-axis type system as specified in:
 * design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 */

import { describe, it, expect } from 'vitest';
import {
  // PayloadType
  type PayloadType,

  // AxisTag
  type AxisTag,
  axisDefault,
  axisInstantiated,
  isInstantiated,
  getAxisValue,

  // Cardinality
  type Cardinality,
  cardinalityZero,
  cardinalityOne,
  cardinalityMany,
  domainRef,

  // Temporality
  type Temporality,
  temporalityContinuous,
  temporalityDiscrete,

  // Binding
  type Binding,
  bindingUnbound,
  bindingWeak,
  bindingStrong,
  bindingIdentity,
  referentRef,

  // Extent
  type Extent,
  extentDefault,
  extent,

  // SignalType
  type SignalType,
  signalType,

  // Defaults
  DEFAULTS_V0,
  FRAME_V0,

  // DomainDecl
  type DomainDecl,
  domainDeclFixedCount,
  domainDeclGrid2d,

  // Unification
  unifyAxis,
  unifyExtent,
  AxisUnificationError,

  // World mapping
  worldToAxes,

  // Derived types
  signalTypeSignal,
  signalTypeField,
  signalTypeTrigger,
  signalTypeStatic,
} from '../canonical-types';

// =============================================================================
// PayloadType Tests
// =============================================================================

describe('PayloadType', () => {
  it('includes all core payload types', () => {
    const payloads: PayloadType[] = ['float', 'int', 'vec2', 'color', 'phase', 'bool', 'unit'];
    expect(payloads.length).toBe(7);
  });

  it('does NOT include event or domain (these are axis concepts)', () => {
    // TypeScript will catch this at compile time, but documenting intent
    const validPayloads: PayloadType[] = ['float', 'int', 'vec2', 'color', 'phase', 'bool', 'unit'];
    expect(validPayloads).not.toContain('event');
    expect(validPayloads).not.toContain('domain');
  });
});

// =============================================================================
// AxisTag Tests
// =============================================================================

describe('AxisTag', () => {
  describe('construction', () => {
    it('creates a default tag', () => {
      const tag = axisDefault<Cardinality>();
      expect(tag.kind).toBe('default');
    });

    it('creates an instantiated tag with value', () => {
      const tag = axisInstantiated(cardinalityOne());
      expect(tag.kind).toBe('instantiated');
      if (tag.kind === 'instantiated') {
        expect(tag.value.kind).toBe('one');
      }
    });
  });

  describe('type narrowing', () => {
    it('isInstantiated returns true for instantiated tags', () => {
      const tag = axisInstantiated(cardinalityOne());
      expect(isInstantiated(tag)).toBe(true);
    });

    it('isInstantiated returns false for default tags', () => {
      const tag = axisDefault<Cardinality>();
      expect(isInstantiated(tag)).toBe(false);
    });

    it('type narrows correctly after isInstantiated check', () => {
      const tag: AxisTag<Cardinality> = axisInstantiated(cardinalityOne());
      if (isInstantiated(tag)) {
        // TypeScript should know tag.value exists here
        expect(tag.value.kind).toBe('one');
      }
    });
  });

  describe('getAxisValue', () => {
    it('returns value for instantiated tag', () => {
      const tag = axisInstantiated(cardinalityOne());
      const value = getAxisValue(tag, cardinalityZero());
      expect(value.kind).toBe('one');
    });

    it('returns default for default tag', () => {
      const tag = axisDefault<Cardinality>();
      const value = getAxisValue(tag, cardinalityZero());
      expect(value.kind).toBe('zero');
    });
  });
});

// =============================================================================
// Cardinality Tests
// =============================================================================

describe('Cardinality', () => {
  it('creates zero cardinality', () => {
    const c = cardinalityZero();
    expect(c.kind).toBe('zero');
  });

  it('creates one cardinality', () => {
    const c = cardinalityOne();
    expect(c.kind).toBe('one');
  });

  it('creates many cardinality with domain reference', () => {
    const c = cardinalityMany(domainRef('particles'));
    expect(c.kind).toBe('many');
    if (c.kind === 'many') {
      expect(c.domain.kind).toBe('domain');
      expect(c.domain.id).toBe('particles');
    }
  });
});

// =============================================================================
// Temporality Tests
// =============================================================================

describe('Temporality', () => {
  it('creates continuous temporality', () => {
    const t = temporalityContinuous();
    expect(t.kind).toBe('continuous');
  });

  it('creates discrete temporality', () => {
    const t = temporalityDiscrete();
    expect(t.kind).toBe('discrete');
  });
});

// =============================================================================
// Binding Tests
// =============================================================================

describe('Binding', () => {
  it('creates unbound binding', () => {
    const b = bindingUnbound();
    expect(b.kind).toBe('unbound');
  });

  it('creates weak binding with referent', () => {
    const b = bindingWeak(referentRef('ref1'));
    expect(b.kind).toBe('weak');
    if (b.kind === 'weak') {
      expect(b.referent.id).toBe('ref1');
    }
  });

  it('creates strong binding with referent', () => {
    const b = bindingStrong(referentRef('ref2'));
    expect(b.kind).toBe('strong');
    if (b.kind === 'strong') {
      expect(b.referent.id).toBe('ref2');
    }
  });

  it('creates identity binding with referent', () => {
    const b = bindingIdentity(referentRef('ref3'));
    expect(b.kind).toBe('identity');
    if (b.kind === 'identity') {
      expect(b.referent.id).toBe('ref3');
    }
  });
});

// =============================================================================
// Extent Tests
// =============================================================================

describe('Extent', () => {
  it('creates default extent with all default axes', () => {
    const e = extentDefault();
    expect(e.cardinality.kind).toBe('default');
    expect(e.temporality.kind).toBe('default');
    expect(e.binding.kind).toBe('default');
    expect(e.perspective.kind).toBe('default');
    expect(e.branch.kind).toBe('default');
  });

  it('creates extent with partial overrides', () => {
    const e = extent({
      cardinality: axisInstantiated(cardinalityOne()),
    });
    expect(e.cardinality.kind).toBe('instantiated');
    expect(e.temporality.kind).toBe('default');
    expect(e.binding.kind).toBe('default');
  });
});

// =============================================================================
// SignalType Tests
// =============================================================================

describe('SignalType', () => {
  it('creates SignalType with payload and default extent', () => {
    const st = signalType('float');
    expect(st.payload).toBe('float');
    expect(st.extent.cardinality.kind).toBe('default');
  });

  it('creates SignalType with payload and custom extent', () => {
    const st = signalType('vec2', {
      cardinality: axisInstantiated(cardinalityMany(domainRef('grid'))),
    });
    expect(st.payload).toBe('vec2');
    expect(st.extent.cardinality.kind).toBe('instantiated');
  });
});

// =============================================================================
// DEFAULTS_V0 Tests
// =============================================================================

describe('DEFAULTS_V0', () => {
  it('has cardinality = one', () => {
    expect(DEFAULTS_V0.cardinality.kind).toBe('one');
  });

  it('has temporality = continuous', () => {
    expect(DEFAULTS_V0.temporality.kind).toBe('continuous');
  });

  it('has binding = unbound', () => {
    expect(DEFAULTS_V0.binding.kind).toBe('unbound');
  });

  it('has perspective = global', () => {
    expect(DEFAULTS_V0.perspective).toBe('global');
  });

  it('has branch = main', () => {
    expect(DEFAULTS_V0.branch).toBe('main');
  });
});

describe('FRAME_V0', () => {
  it('has perspective = global', () => {
    expect(FRAME_V0.perspective).toBe('global');
  });

  it('has branch = main', () => {
    expect(FRAME_V0.branch).toBe('main');
  });
});

// =============================================================================
// DomainDecl Tests
// =============================================================================

describe('DomainDecl', () => {
  it('creates fixed count domain', () => {
    const d = domainDeclFixedCount('particles', 100);
    expect(d.kind).toBe('domain_decl');
    expect(d.id).toBe('particles');
    expect(d.shape.kind).toBe('fixed_count');
    if (d.shape.kind === 'fixed_count') {
      expect(d.shape.count).toBe(100);
    }
  });

  it('creates grid 2d domain', () => {
    const d = domainDeclGrid2d('grid', 10, 10);
    expect(d.kind).toBe('domain_decl');
    expect(d.id).toBe('grid');
    expect(d.shape.kind).toBe('grid_2d');
    if (d.shape.kind === 'grid_2d') {
      expect(d.shape.width).toBe(10);
      expect(d.shape.height).toBe(10);
    }
  });
});

// =============================================================================
// Axis Unification Tests
// =============================================================================

describe('unifyAxis', () => {
  describe('strict join rules (Section 3.5.3)', () => {
    it('default + default → default', () => {
      const a = axisDefault<Cardinality>();
      const b = axisDefault<Cardinality>();
      const result = unifyAxis('cardinality', a, b);
      expect(result.kind).toBe('default');
    });

    it('default + instantiated(X) → instantiated(X)', () => {
      const a = axisDefault<Cardinality>();
      const b = axisInstantiated(cardinalityOne());
      const result = unifyAxis('cardinality', a, b);
      expect(result.kind).toBe('instantiated');
      if (result.kind === 'instantiated') {
        expect(result.value.kind).toBe('one');
      }
    });

    it('instantiated(X) + default → instantiated(X)', () => {
      const a = axisInstantiated(cardinalityOne());
      const b = axisDefault<Cardinality>();
      const result = unifyAxis('cardinality', a, b);
      expect(result.kind).toBe('instantiated');
      if (result.kind === 'instantiated') {
        expect(result.value.kind).toBe('one');
      }
    });

    it('instantiated(X) + instantiated(X) → instantiated(X)', () => {
      const a = axisInstantiated(cardinalityOne());
      const b = axisInstantiated(cardinalityOne());
      const result = unifyAxis('cardinality', a, b);
      expect(result.kind).toBe('instantiated');
      if (result.kind === 'instantiated') {
        expect(result.value.kind).toBe('one');
      }
    });

    it('instantiated(X) + instantiated(Y), X≠Y → ERROR', () => {
      const a = axisInstantiated(cardinalityOne());
      const b = axisInstantiated(cardinalityZero());
      expect(() => unifyAxis('cardinality', a, b)).toThrow(AxisUnificationError);
    });
  });

  describe('complex value equality', () => {
    it('unifies matching many(domain) cardinalities', () => {
      const a = axisInstantiated(cardinalityMany(domainRef('particles')));
      const b = axisInstantiated(cardinalityMany(domainRef('particles')));
      const result = unifyAxis('cardinality', a, b);
      expect(result.kind).toBe('instantiated');
    });

    it('rejects mismatched domain references', () => {
      const a = axisInstantiated(cardinalityMany(domainRef('particles')));
      const b = axisInstantiated(cardinalityMany(domainRef('grid')));
      expect(() => unifyAxis('cardinality', a, b)).toThrow(AxisUnificationError);
    });
  });
});

describe('unifyExtent', () => {
  it('unifies two default extents', () => {
    const a = extentDefault();
    const b = extentDefault();
    const result = unifyExtent(a, b);
    expect(result.cardinality.kind).toBe('default');
    expect(result.temporality.kind).toBe('default');
  });

  it('propagates instantiated values', () => {
    const a = extent({ cardinality: axisInstantiated(cardinalityOne()) });
    const b = extent({ temporality: axisInstantiated(temporalityDiscrete()) });
    const result = unifyExtent(a, b);
    expect(result.cardinality.kind).toBe('instantiated');
    expect(result.temporality.kind).toBe('instantiated');
  });

  it('throws on axis mismatch', () => {
    const a = extent({ cardinality: axisInstantiated(cardinalityOne()) });
    const b = extent({ cardinality: axisInstantiated(cardinalityZero()) });
    expect(() => unifyExtent(a, b)).toThrow(AxisUnificationError);
  });
});

// =============================================================================
// World → Axes Mapping Tests
// =============================================================================

describe('worldToAxes', () => {
  it('maps static to zero + continuous', () => {
    const { cardinality, temporality } = worldToAxes('static');
    expect(cardinality.kind).toBe('zero');
    expect(temporality.kind).toBe('continuous');
  });

  it('maps scalar to zero + continuous', () => {
    const { cardinality, temporality } = worldToAxes('scalar');
    expect(cardinality.kind).toBe('zero');
    expect(temporality.kind).toBe('continuous');
  });

  it('maps signal to one + continuous', () => {
    const { cardinality, temporality } = worldToAxes('signal');
    expect(cardinality.kind).toBe('one');
    expect(temporality.kind).toBe('continuous');
  });

  it('maps field to many(domain) + continuous', () => {
    const { cardinality, temporality } = worldToAxes('field', 'particles');
    expect(cardinality.kind).toBe('many');
    expect(temporality.kind).toBe('continuous');
    if (cardinality.kind === 'many') {
      expect(cardinality.domain.id).toBe('particles');
    }
  });

  it('throws if field is missing domainId', () => {
    expect(() => worldToAxes('field')).toThrow('field world requires domainId');
  });

  it('maps event to one + discrete by default', () => {
    const { cardinality, temporality } = worldToAxes('event');
    expect(cardinality.kind).toBe('one');
    expect(temporality.kind).toBe('discrete');
  });

  it('maps event with domain to many + discrete', () => {
    const { cardinality, temporality } = worldToAxes('event', 'particles');
    expect(cardinality.kind).toBe('many');
    expect(temporality.kind).toBe('discrete');
  });
});

// =============================================================================
// Derived SignalType Helpers Tests
// =============================================================================

describe('derived SignalType helpers', () => {
  it('signalTypeSignal creates one + continuous', () => {
    const st = signalTypeSignal('float');
    expect(st.payload).toBe('float');
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('instantiated');
    expect(temp.kind).toBe('instantiated');
    if (card.kind === 'instantiated' && temp.kind === 'instantiated') {
      expect(card.value.kind).toBe('one');
      expect(temp.value.kind).toBe('continuous');
    }
  });

  it('signalTypeField creates many + continuous', () => {
    const st = signalTypeField('vec2', 'grid');
    expect(st.payload).toBe('vec2');
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('instantiated');
    expect(temp.kind).toBe('instantiated');
    if (card.kind === 'instantiated' && temp.kind === 'instantiated') {
      expect(card.value.kind).toBe('many');
      expect(temp.value.kind).toBe('continuous');
    }
  });

  it('signalTypeTrigger creates one + discrete', () => {
    const st = signalTypeTrigger('unit');
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('instantiated');
    expect(temp.kind).toBe('instantiated');
    if (card.kind === 'instantiated' && temp.kind === 'instantiated') {
      expect(card.value.kind).toBe('one');
      expect(temp.value.kind).toBe('discrete');
    }
  });

  it('signalTypeStatic creates zero + continuous', () => {
    const st = signalTypeStatic('int');
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('instantiated');
    expect(temp.kind).toBe('instantiated');
    if (card.kind === 'instantiated' && temp.kind === 'instantiated') {
      expect(card.value.kind).toBe('zero');
      expect(temp.value.kind).toBe('continuous');
    }
  });
});
