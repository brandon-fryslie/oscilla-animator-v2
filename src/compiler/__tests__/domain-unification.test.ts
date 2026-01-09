/**
 * Domain Unification Tests
 *
 * Verifies that domain compatibility checking works correctly during
 * field expression composition and at render sinks.
 */

import { describe, it, expect } from 'vitest';
import { IRBuilder } from '../ir/builder';
import { signalTypeField } from '../../core/canonical-types';

describe('Domain Unification', () => {
  describe('domain inference', () => {
    it('infers domain from FieldExprSource', () => {
      const b = new IRBuilder();
      const domain = b.domainN(10);
      const type = signalTypeField('number');
      const field = b.fieldSource(domain, 'index', type);

      expect(b.inferFieldDomain(field)).toBe(domain);
    });

    it('propagates domain through FieldExprMap', () => {
      const b = new IRBuilder();
      const domain = b.domainN(10);
      const type = signalTypeField('number');
      const source = b.fieldSource(domain, 'index', type);
      const mapped = b.fieldMap(source, { kind: 'opcode', opcode: 'sin' }, type);

      expect(b.inferFieldDomain(mapped)).toBe(domain);
    });

    it('propagates domain through FieldExprZipSig', () => {
      const b = new IRBuilder();
      const domain = b.domainN(10);
      const fieldType = signalTypeField('number');
      const sigType = signalTypeField('number');
      const field = b.fieldSource(domain, 'index', fieldType);
      const signal = b.sigConst(2.0, sigType);
      const zipped = b.fieldZipSig(field, [signal], { kind: 'opcode', opcode: 'mul' }, fieldType);

      expect(b.inferFieldDomain(zipped)).toBe(domain);
    });

    it('returns undefined for broadcast fields', () => {
      const b = new IRBuilder();
      const type = signalTypeField('number');
      const sig = b.sigConst(1.0, type);
      const broadcast = b.fieldBroadcast(sig, type);

      expect(b.inferFieldDomain(broadcast)).toBeUndefined();
    });

    it('returns undefined for const fields', () => {
      const b = new IRBuilder();
      const type = signalTypeField('number');
      const constField = b.fieldConst(42, type);

      expect(b.inferFieldDomain(constField)).toBeUndefined();
    });
  });

  describe('fieldZip domain validation', () => {
    it('accepts fields from the same domain', () => {
      const b = new IRBuilder();
      const domain = b.domainN(10);
      const type = signalTypeField('number');
      const field1 = b.fieldSource(domain, 'index', type);
      const field2 = b.fieldSource(domain, 'normalizedIndex', type);

      // Should not throw
      const zipped = b.fieldZip([field1, field2], { kind: 'opcode', opcode: 'add' }, type);
      expect(b.inferFieldDomain(zipped)).toBe(domain);
    });

    it('rejects fields from different domains', () => {
      const b = new IRBuilder();
      const domain1 = b.domainN(10);
      const domain2 = b.domainN(20);
      const type = signalTypeField('number');
      const field1 = b.fieldSource(domain1, 'index', type);
      const field2 = b.fieldSource(domain2, 'index', type);

      expect(() => {
        b.fieldZip([field1, field2], { kind: 'opcode', opcode: 'add' }, type);
      }).toThrow(/Domain mismatch/);
    });

    it('handles broadcast fields (no domain) gracefully', () => {
      const b = new IRBuilder();
      const domain = b.domainN(10);
      const type = signalTypeField('number');
      const source = b.fieldSource(domain, 'index', type);
      const sig = b.sigConst(1.0, type);
      const broadcast = b.fieldBroadcast(sig, type);

      // Broadcast has no domain, so zip should use source's domain
      const zipped = b.fieldZip([source, broadcast], { kind: 'opcode', opcode: 'add' }, type);
      expect(b.inferFieldDomain(zipped)).toBe(domain);
    });

    it('accepts multiple broadcast fields without error', () => {
      const b = new IRBuilder();
      const type = signalTypeField('number');
      const sig1 = b.sigConst(1.0, type);
      const sig2 = b.sigConst(2.0, type);
      const broadcast1 = b.fieldBroadcast(sig1, type);
      const broadcast2 = b.fieldBroadcast(sig2, type);

      // Two broadcasts with no domain should be allowed
      const zipped = b.fieldZip([broadcast1, broadcast2], { kind: 'opcode', opcode: 'add' }, type);
      expect(b.inferFieldDomain(zipped)).toBeUndefined();
    });
  });

  describe('domain propagation through composition', () => {
    it('propagates domain through map after zip', () => {
      const b = new IRBuilder();
      const domain = b.domainN(10);
      const type = signalTypeField('number');
      const field1 = b.fieldSource(domain, 'index', type);
      const field2 = b.fieldSource(domain, 'normalizedIndex', type);
      const zipped = b.fieldZip([field1, field2], { kind: 'opcode', opcode: 'add' }, type);
      const mapped = b.fieldMap(zipped, { kind: 'opcode', opcode: 'sin' }, type);

      expect(b.inferFieldDomain(mapped)).toBe(domain);
    });

    it('detects mismatch in nested zip operations', () => {
      const b = new IRBuilder();
      const domain1 = b.domainN(10);
      const domain2 = b.domainN(20);
      const type = signalTypeField('number');
      const field1 = b.fieldSource(domain1, 'index', type);
      const field2 = b.fieldSource(domain2, 'index', type);
      const field3 = b.fieldSource(domain1, 'normalizedIndex', type);

      // Zip field1 and field3 (same domain) - should work
      const zipped1 = b.fieldZip([field1, field3], { kind: 'opcode', opcode: 'add' }, type);

      // Try to zip zipped1 with field2 (different domain) - should fail
      expect(() => {
        b.fieldZip([zipped1, field2], { kind: 'opcode', opcode: 'mul' }, type);
      }).toThrow(/Domain mismatch/);
    });
  });
});
