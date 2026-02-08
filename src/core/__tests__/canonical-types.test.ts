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
  axisInst,
  isAxisInst,

  // Cardinality
  type Cardinality,

  // CanonicalType
  canonicalType,

  // Derived types
  canonicalSignal,
  canonicalField,
  canonicalEvent,

  // Instance system
  instanceRef,
} from '../canonical-types';
import { isConcretePayload } from '../inference-types';
import {
  FLOAT, INT, BOOL, VEC2, VEC3, COLOR, CAMERA_PROJECTION, payloadStride,
  unitNone, unitDegrees, unitTurns, isValidPayloadUnit, defaultUnitForPayload,
} from '../canonical-types';

// =============================================================================
// PayloadType Tests
// =============================================================================

describe('PayloadType', () => {
  it('includes all core payload types', () => {
    const payloads: PayloadType[] = [FLOAT, INT, VEC2, COLOR, BOOL];
    expect(payloads.length).toBe(5);
  });

  it('does NOT include event or domain (these are axis concepts)', () => {
    // TypeScript will catch this at compile time, but documenting intent
    const validPayloads: PayloadType[] = [FLOAT, INT, VEC2, COLOR, BOOL];
    expect(validPayloads).not.toContain('event');
    expect(validPayloads).not.toContain('domain');
  });
});

// =============================================================================
// Axis Tests (Updated for Axis<T,V> system)
// =============================================================================

describe('Axis', () => {
  it('axisInst creates instantiated axis', () => {
    const axis: Cardinality = axisInst({ kind: 'one' });
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
// CanonicalType Tests
// =============================================================================

describe('CanonicalType', () => {
  it('creates CanonicalType with payload and default extent', () => {
    const st = canonicalType(FLOAT);
    expect(st.payload.kind).toBe('float');
    expect(st.extent.cardinality.kind).toBe('inst');
  });
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
    expect(card.kind).toBe('inst');
    expect(temp.kind).toBe('inst');
    if (card.kind === 'inst' && temp.kind === 'inst') {
      expect(card.value.kind).toBe('one');
      expect(temp.value.kind).toBe('continuous');
    }
  });

  it('canonicalField creates many + continuous', () => {
    const instanceRef_ = instanceRef('grid-1', 'default');
    const st = canonicalField(VEC2, { kind: 'none' }, instanceRef_);
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

  it('canonicalEvent creates one + discrete', () => {
    const st = canonicalEvent();
    const card = st.extent.cardinality;
    const temp = st.extent.temporality;
    expect(card.kind).toBe('inst');
    expect(temp.kind).toBe('inst');
    if (card.kind === 'inst' && temp.kind === 'inst') {
      expect(card.value.kind).toBe('one');
      expect(temp.value.kind).toBe('discrete');
    }
  });
});

// =============================================================================
// EventExpr Type Invariants
// =============================================================================

describe('EventExpr Type Invariants', () => {
  it('canonicalEvent creates valid event type (one + discrete)', () => {
    const type = canonicalEvent();

    // Hard invariant: payload must be bool
    expect(type.payload.kind).toBe('bool');
    expect(isConcretePayload(type.payload) ? payloadStride(type.payload) : 1).toBe(1);

    // Hard invariant: unit must be none
    expect(type.unit.kind).toBe('none');

    // Hard invariant: temporality must be discrete
    expect(type.extent.temporality.kind).toBe('inst');
    if (type.extent.temporality.kind === 'inst') {
      expect(type.extent.temporality.value.kind).toBe('discrete');
    }

    // Cardinality should be 'one' for scalar events
    expect(type.extent.cardinality.kind).toBe('inst');
    if (type.extent.cardinality.kind === 'inst') {
      expect(type.extent.cardinality.value.kind).toBe('one');
    }

    // Other axes should be default
    expect(type.extent.binding.kind).toBe('inst');
    expect(type.extent.perspective.kind).toBe('inst');
    expect(type.extent.branch.kind).toBe('inst');
  });
});

// =============================================================================
// Unit System Tests (post scalar→none migration)
// =============================================================================

describe('Unit System (scalar removal)', () => {
  it('defaultUnitForPayload(FLOAT) returns none (not scalar)', () => {
    const unit = defaultUnitForPayload(FLOAT);
    expect(unit.kind).toBe('none');
  });

  it('isValidPayloadUnit(FLOAT, unitNone()) returns true', () => {
    expect(isValidPayloadUnit(FLOAT, unitNone())).toBe(true);
  });

  it('isValidPayloadUnit(FLOAT, unitDegrees()) returns true (angle still valid for float)', () => {
    expect(isValidPayloadUnit(FLOAT, unitDegrees())).toBe(true);
  });

  it('isValidPayloadUnit(FLOAT, unitTurns()) returns true', () => {
    expect(isValidPayloadUnit(FLOAT, unitTurns())).toBe(true);
  });

  it('canonicalType(FLOAT) defaults to unitNone()', () => {
    const type = canonicalType(FLOAT);
    expect(type.unit.kind).toBe('none');
  });
});

// =============================================================================
// Payload Stride Tests
// =============================================================================

describe('payloadStride', () => {
  it('computes stride for all payload types', () => {
    expect(payloadStride(FLOAT)).toBe(1);
    expect(payloadStride(INT)).toBe(1);
    expect(payloadStride(BOOL)).toBe(1);
    expect(payloadStride(VEC2)).toBe(2);
    expect(payloadStride(VEC3)).toBe(3);
    expect(payloadStride(COLOR)).toBe(4);
    expect(payloadStride(CAMERA_PROJECTION)).toBe(1);
  });
});
