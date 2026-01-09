/**
 * Type Adapter Tests
 *
 * Tests for TypeDesc ↔ SignalType conversion functions.
 * Ensures correct mapping between legacy and canonical type systems.
 */

import { describe, it, expect } from 'vitest';
import { typeDescToSignalType, signalTypeToTypeDesc, type TypeDesc } from '../types';
import { getAxisValue, DEFAULTS_V0 } from '../canonical-types';

describe('typeDescToSignalType', () => {
  it('maps signal world to one+continuous', () => {
    const td: TypeDesc = {
      world: 'signal',
      domain: 'float',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('float');

    const cardinality = getAxisValue(st.extent.cardinality, DEFAULTS_V0.cardinality);
    expect(cardinality.kind).toBe('one');

    const temporality = getAxisValue(st.extent.temporality, DEFAULTS_V0.temporality);
    expect(temporality.kind).toBe('continuous');
  });

  it('maps field world to many+continuous', () => {
    const td: TypeDesc = {
      world: 'field',
      domain: 'float',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('float');

    const cardinality = getAxisValue(st.extent.cardinality, DEFAULTS_V0.cardinality);
    expect(cardinality.kind).toBe('many');

    const temporality = getAxisValue(st.extent.temporality, DEFAULTS_V0.temporality);
    expect(temporality.kind).toBe('continuous');
  });

  it('maps event world to discrete temporality', () => {
    const td: TypeDesc = {
      world: 'event',
      domain: 'float',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('float');

    const cardinality = getAxisValue(st.extent.cardinality, DEFAULTS_V0.cardinality);
    expect(cardinality.kind).toBe('one');

    const temporality = getAxisValue(st.extent.temporality, DEFAULTS_V0.temporality);
    expect(temporality.kind).toBe('discrete');
  });

  it('maps scalar world to zero cardinality', () => {
    const td: TypeDesc = {
      world: 'scalar',
      domain: 'float',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('float');

    const cardinality = getAxisValue(st.extent.cardinality, DEFAULTS_V0.cardinality);
    expect(cardinality.kind).toBe('zero');

    const temporality = getAxisValue(st.extent.temporality, DEFAULTS_V0.temporality);
    expect(temporality.kind).toBe('continuous');
  });

  it('maps config world to zero cardinality', () => {
    const td: TypeDesc = {
      world: 'config',
      domain: 'int',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('int');

    const cardinality = getAxisValue(st.extent.cardinality, DEFAULTS_V0.cardinality);
    expect(cardinality.kind).toBe('zero');
  });

  it('maps vec2 domain to vec2 payload', () => {
    const td: TypeDesc = {
      world: 'signal',
      domain: 'vec2',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('vec2');
  });

  it('maps color domain to color payload', () => {
    const td: TypeDesc = {
      world: 'signal',
      domain: 'color',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('color');
  });

  it('maps boolean domain to bool payload', () => {
    const td: TypeDesc = {
      world: 'signal',
      domain: 'boolean',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);

    expect(st.payload).toBe('bool');
  });
});

describe('signalTypeToTypeDesc', () => {
  it('round-trips signal world', () => {
    const td: TypeDesc = {
      world: 'signal',
      domain: 'float',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);
    const back = signalTypeToTypeDesc(st);

    expect(back.world).toBe('signal');
    expect(back.domain).toBe('float');
    expect(back.category).toBe('core');
    expect(back.busEligible).toBe(true);
  });

  it('round-trips field world', () => {
    const td: TypeDesc = {
      world: 'field',
      domain: 'vec2',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);
    const back = signalTypeToTypeDesc(st);

    expect(back.world).toBe('field');
    expect(back.domain).toBe('vec2');
  });

  it('round-trips event world', () => {
    const td: TypeDesc = {
      world: 'event',
      domain: 'boolean',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);
    const back = signalTypeToTypeDesc(st);

    expect(back.world).toBe('event');
    expect(back.domain).toBe('boolean');
  });

  it('round-trips scalar world', () => {
    const td: TypeDesc = {
      world: 'scalar',
      domain: 'int',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);
    const back = signalTypeToTypeDesc(st);

    expect(back.world).toBe('scalar');
    expect(back.domain).toBe('int');
  });

  it('converts zero cardinality to scalar world', () => {
    const td: TypeDesc = {
      world: 'scalar',
      domain: 'float',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);
    const back = signalTypeToTypeDesc(st);

    expect(back.world).toBe('scalar');
  });

  it('converts many cardinality to field world', () => {
    const td: TypeDesc = {
      world: 'field',
      domain: 'color',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);
    const back = signalTypeToTypeDesc(st);

    expect(back.world).toBe('field');
  });

  it('converts discrete temporality to event world', () => {
    const td: TypeDesc = {
      world: 'event',
      domain: 'float',
      category: 'core',
      busEligible: true,
    };
    const st = typeDescToSignalType(td);
    const back = signalTypeToTypeDesc(st);

    expect(back.world).toBe('event');
  });
});
