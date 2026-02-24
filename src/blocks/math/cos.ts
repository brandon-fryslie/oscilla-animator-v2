/**
 * Cos Block
 *
 * Per-element cosine (works with both single-instance and per-instance fields).
 */

import { OpCode } from '../../compiler/ir/types';
import { registerUnaryMathBlock } from './register-unary-math-block';

export function register(): void {
  registerUnaryMathBlock({
    type: 'Cos',
    label: 'Cos',
    description: 'Per-element cosine (works with both single-instance and per-instance fields)',
    opcode: OpCode.Cos,
    cardinalityVarName: 'cos_cardinality',
    unitBehavior: 'requireUnitless',
  });
}
