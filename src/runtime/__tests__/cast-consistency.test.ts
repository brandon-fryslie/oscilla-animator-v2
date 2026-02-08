/**
 * Cast Opcode Consistency Tests
 *
 * Verifies that applyOpcode() and applyPureFn() produce identical results
 * for cast operations, ensuring the single-enforcer pattern holds.
 */

import { describe, it, expect } from 'vitest';
import { applyOpcode } from '../OpcodeInterpreter';
import { applyPureFn } from '../SignalKernelLibrary';
import { OpCode } from '../../compiler/ir/types';

describe('Cast consistency: applyOpcode vs applyPureFn', () => {
  const edgeCases = [0, 1, -1, 42, -42, 3.14, -3.14, 2147483647, -2147483648, 0.5, -0.5];

  describe('F64ToI32Trunc', () => {
    it.each(edgeCases)('value %d produces identical results', (value) => {
      const direct = applyOpcode('f64_to_i32_trunc', [value]);
      const viaFn = applyPureFn({ kind: 'opcode', opcode: OpCode.F64ToI32Trunc }, [value]);
      expect(direct).toBe(viaFn);
    });
  });

  describe('I32ToF64', () => {
    it.each(edgeCases)('value %d produces identical results', (value) => {
      const direct = applyOpcode('i32_to_f64', [value]);
      const viaFn = applyPureFn({ kind: 'opcode', opcode: OpCode.I32ToF64 }, [value]);
      expect(direct).toBe(viaFn);
    });
  });
});
