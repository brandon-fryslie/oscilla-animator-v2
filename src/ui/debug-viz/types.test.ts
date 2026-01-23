import { describe, it, expect } from 'vitest';
import { getSampleEncoding, serializeKey, type DebugTargetKey, type Stride } from './types';
import type { PayloadType } from '../../core/canonical-types';

describe('getSampleEncoding', () => {
  it('returns stride=1 for float', () => {
    const enc = getSampleEncoding('float');
    expect(enc.payload).toBe('float');
    expect(enc.stride).toBe(1);
    expect(enc.components).toEqual(['value']);
    expect(enc.sampleable).toBe(true);
  });

  it('returns stride=1 for int', () => {
    const enc = getSampleEncoding('int');
    expect(enc.payload).toBe('int');
    expect(enc.stride).toBe(1);
    expect(enc.components).toEqual(['value']);
    expect(enc.sampleable).toBe(true);
  });

  it('returns stride=2 for vec2', () => {
    const enc = getSampleEncoding('vec2');
    expect(enc.payload).toBe('vec2');
    expect(enc.stride).toBe(2);
    expect(enc.components).toEqual(['x', 'y']);
    expect(enc.sampleable).toBe(true);
  });

  it('returns stride=4 for color', () => {
    const enc = getSampleEncoding('color');
    expect(enc.payload).toBe('color');
    expect(enc.stride).toBe(4);
    expect(enc.components).toEqual(['r', 'g', 'b', 'a']);
    expect(enc.sampleable).toBe(true);
  });

  it('returns stride=0, sampleable=false for bool', () => {
    const enc = getSampleEncoding('bool');
    expect(enc.payload).toBe('bool');
    expect(enc.stride).toBe(0);
    expect(enc.components).toEqual([]);
    expect(enc.sampleable).toBe(false);
  });

  it('returns stride=0, sampleable=false for shape', () => {
    const enc = getSampleEncoding('shape');
    expect(enc.payload).toBe('shape');
    expect(enc.stride).toBe(0);
    expect(enc.components).toEqual([]);
    expect(enc.sampleable).toBe(false);
  });

  it('covers all PayloadType members exhaustively', () => {
    // This test verifies that every member of PayloadType is handled.
    // If a new PayloadType is added and getSampleEncoding is not updated,
    // TypeScript will catch it at compile time (never check).
    // This runtime test ensures no unexpected values slip through.
    const allPayloads: PayloadType[] = ['float', 'int', 'vec2', 'color', 'bool', 'shape'];
    for (const p of allPayloads) {
      expect(() => getSampleEncoding(p)).not.toThrow();
    }
  });

  it('throws on unknown payload type', () => {
    // Force a bad value past TypeScript to verify runtime exhaustiveness
    expect(() => getSampleEncoding('unknown' as PayloadType)).toThrow('Unknown PayloadType');
  });
});

describe('serializeKey', () => {
  it('serializes edge keys with "e:" prefix', () => {
    const key: DebugTargetKey = { kind: 'edge', edgeId: 'edge-123' };
    expect(serializeKey(key)).toBe('e:edge-123');
  });

  it('serializes port keys with "p:" prefix and NUL separator', () => {
    const key: DebugTargetKey = { kind: 'port', blockId: 'block-1', portName: 'out' };
    expect(serializeKey(key)).toBe('p:block-1\0out');
  });

  it('produces different serializations for different edge IDs', () => {
    const k1: DebugTargetKey = { kind: 'edge', edgeId: 'a' };
    const k2: DebugTargetKey = { kind: 'edge', edgeId: 'b' };
    expect(serializeKey(k1)).not.toBe(serializeKey(k2));
  });

  it('produces different serializations for edge vs port with same string', () => {
    const edge: DebugTargetKey = { kind: 'edge', edgeId: 'block-1\0out' };
    const port: DebugTargetKey = { kind: 'port', blockId: 'block-1', portName: 'out' };
    expect(serializeKey(edge)).not.toBe(serializeKey(port));
  });

  it('is bijective - different port keys produce different strings', () => {
    const k1: DebugTargetKey = { kind: 'port', blockId: 'a', portName: 'b' };
    const k2: DebugTargetKey = { kind: 'port', blockId: 'a', portName: 'c' };
    const k3: DebugTargetKey = { kind: 'port', blockId: 'ab', portName: '' };
    expect(serializeKey(k1)).not.toBe(serializeKey(k2));
    expect(serializeKey(k1)).not.toBe(serializeKey(k3));
  });
});

describe('Stride type', () => {
  it('only allows values 0-4', () => {
    // Compile-time test: these should all be valid Stride values
    const valid: Stride[] = [0, 1, 2, 3, 4];
    expect(valid).toHaveLength(5);
    // Values outside 0-4 would be a TypeScript error (compile-time enforcement)
  });
});
