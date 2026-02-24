/**
 * Divide Block
 *
 * Divides two numbers (single-instance or per-instance fields).
 */

import { OpCode } from '../../compiler/ir/types';
import { registerBinaryMathBlock } from './register-binary-math-block';

export function register(): void {
  registerBinaryMathBlock({
    type: 'Divide',
    label: 'Divide',
    description: 'Divides two numbers (single-instance or per-instance fields)',
    opcode: OpCode.Div,
    cardinalityVarName: 'divide_cardinality',
    unitBehavior: 'requireUnitless',
  });
}
