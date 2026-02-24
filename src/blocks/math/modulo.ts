/**
 * Modulo Block
 *
 * Computes modulo of two numbers (single-instance or per-instance fields).
 */

import { OpCode } from '../../compiler/ir/types';
import { registerBinaryMathBlock } from './register-binary-math-block';

export function register(): void {
  registerBinaryMathBlock({
    type: 'Modulo',
    label: 'Modulo',
    description: 'Computes modulo of two numbers (single-instance or per-instance fields)',
    opcode: OpCode.Mod,
    cardinalityVarName: 'modulo_cardinality',
    unitBehavior: 'preserve',
  });
}
