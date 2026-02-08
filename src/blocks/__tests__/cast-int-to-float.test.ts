/**
 * CastIntToFloat Adapter Tests
 *
 * Verifies adapter selection and unit passthrough for int → float conversion.
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

describe('CastIntToFloat adapter selection', () => {
  it('findAdapter(int:none, float:none) returns Adapter_CastIntToFloat', () => {
    const from = canonicalType(INT, unitNone());
    const to = canonicalType(FLOAT, unitNone());
    const adapter = findAdapter(from, to);
    expect(adapter).not.toBeNull();
    expect(adapter!.blockType).toBe('Adapter_CastIntToFloat');
    expect(adapter!.inputPortId).toBe('in');
    expect(adapter!.outputPortId).toBe('out');
  });

  it('findAdapter(int:radians, float:radians) returns Adapter_CastIntToFloat (unit passthrough)', () => {
    const from = canonicalType(INT, unitRadians());
    const to = canonicalType(FLOAT, unitRadians());
    const adapter = findAdapter(from, to);
    expect(adapter).not.toBeNull();
    expect(adapter!.blockType).toBe('Adapter_CastIntToFloat');
  });

  it('findAdapter(int:radians, float:none) returns null (unit mismatch)', () => {
    const from = canonicalType(INT, unitRadians());
    const to = canonicalType(FLOAT, unitNone());
    expect(findAdapter(from, to)).toBeNull();
  });
});
