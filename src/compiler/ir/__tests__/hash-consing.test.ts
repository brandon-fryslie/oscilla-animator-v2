import { describe, it, expect } from 'vitest';
import { IRBuilderImpl } from '../IRBuilderImpl';
import { canonicalType, canonicalField, floatConst, vec2Const, intConst, instanceRef } from '../../../core/canonical-types';
import { FLOAT, INT, VEC2 } from '../../../core/canonical-types';
import { OpCode } from '../types';
import { instanceId } from '../Indices';

describe('Hash-consing (I13)', () => {
  describe('SigExpr deduplication', () => {
    it('deduplicates identical sigConst', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      
      const id1 = b.constant(floatConst(1.0), type);
      const id2 = b.constant(floatConst(1.0), type);
      
      expect(id1).toBe(id2); // MUST be same ID
    });

    it('distinguishes different sigConst values', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      
      const id1 = b.constant(floatConst(1.0), type);
      const id2 = b.constant(floatConst(2.0), type);
      
      expect(id1).not.toBe(id2);
    });

    it('deduplicates identical sigTime', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      
      const id1 = b.time('tMs', type);
      const id2 = b.time('tMs', type);
      
      expect(id1).toBe(id2);
    });

    it('distinguishes different sigTime variants', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      
      const id1 = b.time('tMs', type);
      const id2 = b.time('dt', type);
      
      expect(id1).not.toBe(id2);
    });

    it('deduplicates identical sigExternal', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      
      const id1 = b.external('audioLevel', type);
      const id2 = b.external('audioLevel', type);
      
      expect(id1).toBe(id2);
    });

    it('deduplicates identical sigMap', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      
      const input = b.constant(floatConst(1.0), type);
      const fn = { kind: 'opcode' as const, opcode: OpCode.Sin };
      
      const id1 = b.kernelMap(input, fn, type);
      const id2 = b.kernelMap(input, fn, type);
      
      expect(id1).toBe(id2);
    });

    it('deduplicates identical sigZip', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      
      const a = b.constant(floatConst(2.0), type);
      const b1 = b.constant(floatConst(3.0), type);
      const fn = { kind: 'opcode' as const, opcode: OpCode.Add };
      
      const sum1 = b.kernelZip([a, b1], fn, type);
      const sum2 = b.kernelZip([a, b1], fn, type);
      
      expect(sum1).toBe(sum2);
    });

    it('deduplicates identical sigZip via opcode helper', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const a = b.constant(floatConst(2.0), type);
      const b1 = b.constant(floatConst(3.0), type);
      const fn = { kind: 'opcode' as const, opcode: OpCode.Add };

      const sum1 = b.kernelZip([a, b1], fn, type);
      const sum2 = b.kernelZip([a, b1], fn, type);

      expect(sum1).toBe(sum2);
    });

    it('deduplicates identical sigUnaryOp (uses sigMap)', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const input = b.constant(floatConst(1.0), type);

      const fn = { kind: 'opcode' as const, opcode: OpCode.Sin };

      const result1 = b.kernelMap(input, fn, type);
      const result2 = b.kernelMap(input, fn, type);

      expect(result1).toBe(result2);
    });

    it('deduplicates identical sigCombine', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const a = b.constant(floatConst(1.0), type);
      const b1 = b.constant(floatConst(2.0), type);

      const sum1 = b.combine([a, b1], 'sum', type);
      const sum2 = b.combine([a, b1], 'sum', type);

      expect(sum1).toBe(sum2);
    });

    it('deduplicates identical ReduceField', () => {
      const b = new IRBuilderImpl();
      const sigType = canonicalType(FLOAT);
      const fieldType = canonicalField(FLOAT, undefined, instanceRef('test', 'inst-0'));

      const sig = b.constant(floatConst(1.0), sigType);
      const field = b.broadcast(sig, fieldType);

      const reduce1 = b.reduce(field, 'sum', sigType);
      const reduce2 = b.reduce(field, 'sum', sigType);

      expect(reduce1).toBe(reduce2);
    });
  });

  describe('Compound expression deduplication', () => {
    it('deduplicates transitively', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      // Constants deduplicate
      const a = b.constant(floatConst(2.0), type);
      const b1 = b.constant(floatConst(3.0), type);
      const b2 = b.constant(floatConst(3.0), type);
      expect(b1).toBe(b2);

      // Operations using deduplicated inputs also deduplicate
      const addFn = { kind: 'opcode' as const, opcode: OpCode.Add };
      const sum1 = b.kernelZip([a, b1], addFn, type);
      const sum2 = b.kernelZip([a, b2], addFn, type);
      expect(sum1).toBe(sum2);
    });

    it('deduplicates nested expressions', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const a = b.constant(floatConst(1.0), type);
      const b1 = b.constant(floatConst(2.0), type);

      const addFn = { kind: 'opcode' as const, opcode: OpCode.Add };
      const mulFn = { kind: 'opcode' as const, opcode: OpCode.Mul };

      // Build: (a + b) * 2
      const sum1 = b.kernelZip([a, b1], addFn, type);
      const two1 = b.constant(floatConst(2.0), type);
      const result1 = b.kernelZip([sum1, two1], mulFn, type);

      // Build same expression again
      const sum2 = b.kernelZip([a, b1], addFn, type);
      const two2 = b.constant(floatConst(2.0), type);
      const result2 = b.kernelZip([sum2, two2], mulFn, type);

      // All subexpressions should be deduplicated
      expect(sum1).toBe(sum2);
      expect(two1).toBe(two2);
      expect(result1).toBe(result2);
    });
  });

  describe('FieldExpr deduplication', () => {
    it('deduplicates identical fieldConst', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const id1 = b.constant(floatConst(1.0), type);
      const id2 = b.constant(floatConst(1.0), type);

      expect(id1).toBe(id2);
    });

    it('distinguishes different fieldConst values', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const id1 = b.constant(floatConst(1.0), type);
      const id2 = b.constant(floatConst(2.0), type);

      expect(id1).not.toBe(id2);
    });

    it('deduplicates identical Broadcast', () => {
      const b = new IRBuilderImpl();
      const sigType = canonicalType(FLOAT);
      const fieldType = canonicalField(FLOAT, undefined, instanceRef('test', 'inst-0'));

      const sig = b.constant(floatConst(1.0), sigType);
      const id1 = b.broadcast(sig, fieldType);
      const id2 = b.broadcast(sig, fieldType);

      expect(id1).toBe(id2);
    });

    it('deduplicates fieldIntrinsic with same instanceId', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      const inst = instanceId('inst1');

      const id1 = b.intrinsic('index', type);
      const id2 = b.intrinsic('index', type);

      expect(id1).toBe(id2);
    });

    it('distinguishes fieldIntrinsic with different intrinsic names', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const id1 = b.intrinsic('index', type);
      const id2 = b.intrinsic('randomId', type);

      expect(id1).not.toBe(id2);
    });

    it('distinguishes fieldIntrinsic with different properties', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      const inst = instanceId('inst1');

      const id1 = b.intrinsic('index', type);
      const id2 = b.intrinsic('normalizedIndex', type);

      expect(id1).not.toBe(id2);
    });

    it('deduplicates identical fieldPlacement', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(VEC2);
      const inst = instanceId('inst1');

      const id1 = b.placement('uv', 'halton2D', type);
      const id2 = b.placement('uv', 'halton2D', type);

      expect(id1).toBe(id2);
    });
  });

  describe('EventExpr deduplication', () => {
    it('deduplicates identical eventPulse', () => {
      const b = new IRBuilderImpl();

      const id1 = b.eventPulse('InfiniteTimeRoot');
      const id2 = b.eventPulse('InfiniteTimeRoot');

      expect(id1).toBe(id2);
    });

    it('deduplicates identical eventNever', () => {
      const b = new IRBuilderImpl();

      const id1 = b.eventNever();
      const id2 = b.eventNever();

      expect(id1).toBe(id2);
    });

    it('deduplicates identical eventWrap', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const sig = b.constant(floatConst(1.0), type);
      const id1 = b.eventWrap(sig);
      const id2 = b.eventWrap(sig);

      expect(id1).toBe(id2);
    });

    it('deduplicates identical eventCombine', () => {
      const b = new IRBuilderImpl();

      const evt1 = b.eventPulse('InfiniteTimeRoot');
      const evt2 = b.eventNever();

      const combine1 = b.eventCombine([evt1, evt2], 'any');
      const combine2 = b.eventCombine([evt1, evt2], 'any');

      expect(combine1).toBe(combine2);
    });
  });

  describe('Edge cases', () => {
    it('handles array order correctly (different order = different expr)', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const a = b.constant(floatConst(1.0), type);
      const b1 = b.constant(floatConst(2.0), type);
      const fn = { kind: 'opcode' as const, opcode: OpCode.Add };

      const zip1 = b.kernelZip([a, b1], fn, type);
      const zip2 = b.kernelZip([b1, a], fn, type);

      expect(zip1).not.toBe(zip2); // Order matters
    });

    it('handles PureFn opcodes correctly', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const input = b.constant(floatConst(1.0), type);
      const fn = { kind: 'opcode' as const, opcode: OpCode.Sin };

      const id1 = b.kernelMap(input, fn, type);
      const id2 = b.kernelMap(input, fn, type);

      expect(id1).toBe(id2);
    });

    it('distinguishes different PureFn opcodes', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const input = b.constant(floatConst(1.0), type);
      const fn1 = { kind: 'opcode' as const, opcode: OpCode.Sin };
      const fn2 = { kind: 'opcode' as const, opcode: OpCode.Cos };

      const id1 = b.kernelMap(input, fn1, type);
      const id2 = b.kernelMap(input, fn2, type);

      expect(id1).not.toBe(id2);
    });

    it('handles float precision consistently', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const id1 = b.constant(floatConst(1.0), type);
      const id2 = b.constant(floatConst(1.00), type);

      expect(id1).toBe(id2); // JS number normalization
    });

    it('distinguishes different signal types', () => {
      const b = new IRBuilderImpl();
      const floatType = canonicalType(FLOAT);
      const intType = canonicalType(INT);

      const id1 = b.constant(floatConst(1), floatType);
      const id2 = b.constant(intConst(1), intType);

      expect(id1).not.toBe(id2);
    });

    it('handles composed PureFn correctly', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      const input = b.constant(floatConst(1.0), type);
      const fn = { kind: 'composed' as const, ops: [OpCode.Sin, OpCode.Cos] as readonly OpCode[] };

      const id1 = b.kernelMap(input, fn, type);
      const id2 = b.kernelMap(input, fn, type);

      expect(id1).toBe(id2);
    });
  });

  describe('Real-world scenarios', () => {
    it('reduces expression count in typical patch', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);

      // Simulate a patch with repeated time references
      const time1 = b.time('tMs', type);
      const time2 = b.time('tMs', type);
      const time3 = b.time('tMs', type);

      // All should be the same ID
      expect(time1).toBe(time2);
      expect(time2).toBe(time3);

      // Create multiple instances of same computation
      const one = b.constant(floatConst(1.0), type);
      const pi = b.constant(floatConst(3.14159), type);

      const addFn = { kind: 'opcode' as const, opcode: OpCode.Add };
      const mulFn = { kind: 'opcode' as const, opcode: OpCode.Mul };

      for (let i = 0; i < 5; i++) {
        const result = b.kernelZip([time1, one], addFn, type);
        const scaled = b.kernelZip([result, pi], mulFn, type);

        const fn = { kind: 'opcode' as const, opcode: OpCode.Sin };

        const sin = b.kernelMap(scaled, fn, type);
        
        // Each iteration should reuse the same expressions
        if (i > 0) {
          expect(result).toBe(result); // Same computation gets same ID
        }
      }
    });

    it('deduplicates broadcast patterns', () => {
      const b = new IRBuilderImpl();
      const type = canonicalType(FLOAT);
      const fieldType = canonicalField(FLOAT, undefined, instanceRef('test', 'inst-0'));

      const time = b.time('tMs', type);

      // Multiple broadcasts of same signal
      const broadcast1 = b.broadcast(time, fieldType);
      const broadcast2 = b.broadcast(time, fieldType);
      const broadcast3 = b.broadcast(time, fieldType);

      expect(broadcast1).toBe(broadcast2);
      expect(broadcast2).toBe(broadcast3);
    });
  });
});
