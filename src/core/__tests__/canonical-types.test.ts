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

  // Axis
  type Axis,
  axisInst,
  axisVar,
  isAxisInst,

  // Cardinality
  type CardinalityValue,
  type CardinalityAxis,

  // Temporality
  type TemporalityValue,

  // Binding
  type BindingValue,

  // Extent
  type Extent,

  // CanonicalType
  type CanonicalType,
  canonicalType,

  // Defaults
  DEFAULTS_V0,
  FRAME_V0,

  // Instance system
  instanceRef,

  // Unification
  unifyAxis,
  unifyExtent,
  AxisUnificationError,

  // Derived types
  canonicalSignal,
  canonicalField,
  canonicalEventOne,

  // Event types
  eventType,
  eventTypeScalar,
  eventTypePerInstance,
  isPayloadVar,
  isConcretePayload,
} from '../canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../canonical-types';
import { instanceId, domainTypeId } from '../ids';

// =============================================================================
// PayloadType Tests
// =============================================================================

describe('PayloadType', () => {
  it('includes all core payload types', () => {
    const payloads: PayloadType[] = [FLOAT, INT, VEC2, COLOR, BOOL, SHAPE];
    expect(payloads.length).toBe(6);
  });

  it('does NOT include event or domain (these are axis concepts)', () => {
    // TypeScript will catch this at compile time, but documenting intent
    const validPayloads: PayloadType[] = [FLOAT, INT, VEC2, COLOR, BOOL, SHAPE];
    expect(validPayloads).not.toContain('event');
    expect(validPayloads).not.toContain('domain');
  });
});

// =============================================================================
// Axis Tests (Updated for Axis<T,V> system)
// =============================================================================

describe('Axis', () => {
  it('axisInst creates instantiated axis', () => {
    const axis: CardinalityAxis = axisInst({ kind: 'one' });
    expect(axis.kind).toBe('inst');
    if (axis.kind === 'inst') {
      expect(axis.value.kind).toBe('one');
    }
  });

  it('isAxisInst type guard works', () => {
    const axis = axisInst({ kind: 'one' });
    expect(isAxisInst(axis)).toBe(true);
  });
});

// =============================================================================
// Cardinality Tests
// =============================================================================

describe('Cardinality', () => {
  // TODO: rewrite for canonical types
  // it('creates zero cardinality', () => {
  //   const c = cardinalityZero();
  //   expect(c.kind).toBe('zero');
  // });
  //
  // it('creates one cardinality', () => {
  //   const c = cardinalityOne();
  //   expect(c.kind).toBe('one');
  // });

  // TODO: rewrite for canonical types
  // it('creates many cardinality with instance reference', () => {
  //   const c = cardinalityMany(instanceRef(instanceId('circles-1'), domainTypeId('circle')));
  //   expect(c.kind).toBe('many');
  //   if (c.kind === 'many') {
  //     // InstanceRef no longer has 'kind' field
  //     expect(c.instance.domainTypeId).toBe('circle' as any);
  //     expect(c.instance.instanceId).toBe('circles-1' as any);
  //   }
  // });
});

// =============================================================================
// Temporality Tests
// =============================================================================
// TODO: rewrite for canonical types
// describe('Temporality', () => {
//   it('creates continuous temporality', () => {
//     const t = temporalityContinuous();
//     expect(t.kind).toBe('continuous');
//   });
//
//   it('creates discrete temporality', () => {
//     const t = temporalityDiscrete();
//     expect(t.kind).toBe('discrete');
//   });
// });

// =============================================================================
// Binding Tests
// =============================================================================

describe('Binding', () => {
  // TODO: rewrite for canonical types
  // it('creates unbound binding', () => {
  //   const b = bindingUnbound();
  //   expect(b.kind).toBe('unbound');
  // });
  //
  // it('creates weak binding with referent', () => {
  //   const b = bindingWeak(referentRef('ref1'));
  //   expect(b.kind).toBe('weak');
  //   // Referent no longer stored in BindingValue (D1)
  // });
  //
  // it('creates strong binding with referent', () => {
  //   const b = bindingStrong(referentRef('ref2'));
  //   expect(b.kind).toBe('strong');
  //   // Referent no longer stored in BindingValue (D1)
  // });
  //
  // it('creates identity binding with referent', () => {
  //   const b = bindingIdentity(referentRef('ref3'));
  //   expect(b.kind).toBe('identity');
  //   // Referent no longer stored in BindingValue (D1)
  // });
});

// =============================================================================
// Extent Tests
// =============================================================================

describe('Extent', () => {
  // Note: extentDefault() and extent() removed - construct Extent objects directly using axisInst()
});

// =============================================================================
// CanonicalType Tests
// =============================================================================

describe('CanonicalType', () => {
  it('creates CanonicalType with payload and default extent', () => {
    const st = canonicalType(FLOAT);
    expect(st.payload.kind).toBe('float');
    expect(st.extent.cardinality.kind).toBe('default');
  });

  // TODO: rewrite for canonical types
  // it('creates CanonicalType with payload and custom extent', () => {
  //   const st = canonicalType(VEC2, {
  //     cardinality: axisInstantiated(cardinalityMany(instanceRef(instanceId('grid-1'), domainTypeId('shape')))),
  //   });
  //   expect(st.payload.kind).toBe('vec2');
  //   expect(st.extent.cardinality.kind).toBe('instantiated');
  // });
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
// Axis Unification Tests (Updated for Axis<T,V>)
// =============================================================================

describe('unifyAxis', () => {
  it('inst(X) + inst(X) → inst(X)', () => {
    const a = axisInst({ kind: 'one' });
    const b = axisInst({ kind: 'one' });
    const result = unifyAxis('cardinality', a, b);
    expect(result.kind).toBe('inst');
    if (result.kind === 'inst') {
      expect(result.value.kind).toBe('one');
    }
  });

  it('inst(X) + inst(Y), X≠Y → ERROR', () => {
    const a = axisInst({ kind: 'one' });
    const b = axisInst({ kind: 'zero' });
    expect(() => unifyAxis('cardinality', a, b)).toThrow(AxisUnificationError);
  });

  // TODO: rewrite for canonical types
  // it('unifies matching many(instance) cardinalities', () => {
  //   const a = axisInst(cardinalityMany(instanceRef(instanceId('inst-1'), domainTypeId('circle'))));
  //   const b = axisInst(cardinalityMany(instanceRef(instanceId('inst-1'), domainTypeId('circle'))));
  //   const result = unifyAxis('cardinality', a, b);
  //   expect(result.kind).toBe('inst');
  // });

// TODO: rewrite for canonical types
  // it('rejects mismatched instance references', () => {
  //   const a = axisInst(cardinalityMany(instanceRef(instanceId('inst-1'), domainTypeId('circle'))));
  //   const b = axisInst(cardinalityMany(instanceRef(instanceId('inst-2'), domainTypeId('circle'))));
  //   expect(() => unifyAxis('cardinality', a, b)).toThrow(AxisUnificationError);
  // });
});

describe('unifyExtent', () => {
  // Note: extent() and extentDefault() helpers removed - tests should construct Extent objects directly
});

// =============================================================================
// Derived CanonicalType Helpers Tests
// =============================================================================

describe('derived CanonicalType helpers', () => {
  it('canonicalSignal creates one + continuous', () => {
    const st = canonicalSignal(FLOAT);
    expect(st.payload.kind).toBe('float');
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('instantiated');
    expect(temp.kind).toBe('instantiated');
    if (card.kind === 'inst' && temp.kind === 'inst') {
      expect(card.value.kind).toBe('one');
      expect(temp.value.kind).toBe('continuous');
    }
  });

  it('canonicalField creates many + continuous', () => {
    const instanceRef_ = instanceRef(instanceId('grid-1'), domainTypeId('default'));
    const st = canonicalField(VEC2, { kind: 'scalar' }, instanceRef_);
    expect(st.payload.kind).toBe('vec2');
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('inst');
    expect(temp.kind).toBe('inst');
    if (card.kind === 'inst' && temp.kind === 'inst') {
      expect(card.value.kind).toBe('many');
      expect(temp.value.kind).toBe('continuous');
    }
  });

  it('canonicalEventOne creates one + discrete', () => {
    const st = canonicalEventOne();
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('inst');
    expect(temp.kind).toBe('inst');
    if (card.kind === 'inst' && temp.kind === 'inst') {
      expect(card.value.kind).toBe('one');
      expect(temp.value.kind).toBe('discrete');
    }
  });

  it('canonicalType creates zero + continuous', () => {
    const st = canonicalType(INT);
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('instantiated');
    expect(temp.kind).toBe('instantiated');
    if (card.kind === 'inst' && temp.kind === 'inst') {
      expect(card.value.kind).toBe('zero');
      expect(temp.value.kind).toBe('continuous');
    }
  });
});

// =============================================================================
// EventExpr Type Invariants
// =============================================================================

describe('EventExpr Type Invariants', () => {
  it('eventTypeScalar creates valid event type (one + discrete)', () => {
    const type = eventTypeScalar();

    // Hard invariant: payload must be bool
    expect(type.payload.kind).toBe('bool');
    expect(isConcretePayload(type.payload) ? type.payload.stride : 1).toBe(1);

    // Hard invariant: unit must be none
    expect(type.unit.kind).toBe('none');

    // Hard invariant: temporality must be discrete
    expect(type.extent.temporality.kind).toBe('instantiated');
    if (type.extent.temporality.kind === 'inst') {
      expect(type.extent.temporality.value.kind).toBe('discrete');
    }

    // Cardinality should be 'one' for scalar events
    expect(type.extent.cardinality.kind).toBe('instantiated');
    if (type.extent.cardinality.kind === 'inst') {
      expect(type.extent.cardinality.value.kind).toBe('one');
    }

    // Other axes should be default
    expect(type.extent.binding.kind).toBe('default');
    expect(type.extent.perspective.kind).toBe('default');
    expect(type.extent.branch.kind).toBe('default');
  });

  it('eventTypePerInstance creates valid event type (many + discrete)', () => {
    const ref = instanceRef(instanceId('test-instance'), domainTypeId('circle'));
    const type = eventTypePerInstance(ref);

    // Hard invariant: payload must be bool
    expect(type.payload.kind).toBe('bool');
    expect(isConcretePayload(type.payload) ? type.payload.stride : 1).toBe(1);

    // Hard invariant: unit must be none
    expect(type.unit.kind).toBe('none');

    // Hard invariant: temporality must be discrete
    expect(type.extent.temporality.kind).toBe('instantiated');
    if (type.extent.temporality.kind === 'inst') {
      expect(type.extent.temporality.value.kind).toBe('discrete');
    }

    // Cardinality should be 'many' for per-instance events
    expect(type.extent.cardinality.kind).toBe('instantiated');
    if (type.extent.cardinality.kind === 'inst') {
      expect(type.extent.cardinality.value.kind).toBe('many');
      if (type.extent.cardinality.value.kind === 'many') {
        expect(type.extent.cardinality.value.instance.instanceId).toBe('test-instance');
        expect(type.extent.cardinality.value.instance.domainTypeId).toBe('circle');
      }
    }
  });

  it('eventType accepts custom cardinality axis', () => {
    const customCard: CardinalityAxis = axisInst({ kind: 'one' });
    const type = eventType(customCard);

    expect(type.payload.kind).toBe('bool');
    expect(type.unit.kind).toBe('none');
    expect(type.extent.temporality.kind).toBe('instantiated');
    if (type.extent.temporality.kind === 'inst') {
      expect(type.extent.temporality.value.kind).toBe('discrete');
    }
  });
});
