/**
 * CastFloatToInt Adapter Tests
 *
 * Verifies adapter selection, unit passthrough, and rejection of
 * reverse direction and unit-mismatch cases.
 */

import { describe, it, expect } from 'vitest';
import { findAdapter } from '../adapter-spec';
import {
  canonicalType,
  unitNone,
  unitRadians,
} from '../../core/canonical-types';
import { FLOAT, INT } from '../../core/canonical-types';

// Ensure adapter blocks are registered
import '../all';

describe('CastFloatToInt adapter selection', () => {
  it('findAdapter(float:none, int:none) returns Adapter_CastFloatToInt', () => {
    const from = canonicalType(FLOAT, unitNone());
    const to = canonicalType(INT, unitNone());
    const adapter = findAdapter(from, to);
    expect(adapter).not.toBeNull();
    expect(adapter!.blockType).toBe('Adapter_CastFloatToInt');
    expect(adapter!.inputPortId).toBe('in');
    expect(adapter!.outputPortId).toBe('out');
  });

  it('findAdapter(float:radians, int:radians) returns Adapter_CastFloatToInt (unit passthrough)', () => {
    const from = canonicalType(FLOAT, unitRadians());
    const to = canonicalType(INT, unitRadians());
    const adapter = findAdapter(from, to);
    expect(adapter).not.toBeNull();
    expect(adapter!.blockType).toBe('Adapter_CastFloatToInt');
  });

  it('findAdapter(float:radians, int:none) returns null (unit mismatch)', () => {
    const from = canonicalType(FLOAT, unitRadians());
    const to = canonicalType(INT, unitNone());
    // Units differ — adapter chain needed, not direct CastFloatToInt
    expect(findAdapter(from, to)).toBeNull();
  });

  it('findAdapter(int:none, float:none) returns Adapter_CastIntToFloat', () => {
    const from = canonicalType(INT, unitNone());
    const to = canonicalType(FLOAT, unitNone());
    const adapter = findAdapter(from, to);
    expect(adapter).not.toBeNull();
    expect(adapter!.blockType).toBe('Adapter_CastIntToFloat');
    expect(adapter!.inputPortId).toBe('in');
    expect(adapter!.outputPortId).toBe('out');
  });
});
