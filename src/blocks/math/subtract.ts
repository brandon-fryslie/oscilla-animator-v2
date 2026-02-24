/**
 * Subtract Block
 *
 * Subtracts two numbers (single-instance or per-instance fields).
 */

import { OpCode } from '../../compiler/ir/types';
import { registerBinaryMathBlock } from './register-binary-math-block';

export function register(): void {
  registerBinaryMathBlock({
    type: 'Subtract',
    label: 'Subtract',
    description: 'Subtracts two numbers (single-instance or per-instance fields)',
    opcode: OpCode.Sub,
    cardinalityVarName: 'subtract_cardinality',
    unitBehavior: 'preserve',
  });
}
