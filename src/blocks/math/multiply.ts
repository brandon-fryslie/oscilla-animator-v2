/**
 * Multiply Block
 *
 * Multiplies two numbers (single-instance or per-instance fields).
 */

import { OpCode } from '../../compiler/ir/types';
import { registerBinaryMathBlock } from './register-binary-math-block';

export function register(): void {
  registerBinaryMathBlock({
    type: 'Multiply',
    label: 'Multiply',
    description: 'Multiplies two numbers (single-instance or per-instance fields)',
    opcode: OpCode.Mul,
    cardinalityVarName: 'multiply_cardinality',
    unitBehavior: 'requireUnitless',
  });
}
